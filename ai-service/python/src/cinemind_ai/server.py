"""CineMind AI service entrypoint.

Endpoints:
  GET  /health
  POST /chat      bounded conversational turn (tools behind registry)
  POST /sanitize  isolate facts from untrusted web text, drop instructions
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import get_settings
from .models import ChatRequest, ChatResponse, Fact, utcnow
from .providers import build_provider
from .sanitize import extract_facts_from_text
from .tools import build_registry

logger = logging.getLogger("cinemind_ai")
limiter = Limiter(key_func=get_remote_address)

settings = get_settings()
registry = build_registry(settings.cinemind_backend_base_url, settings.backend_timeout_seconds)
provider = build_provider(settings, registry)

app = FastAPI(title="CineMind AI Service", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "cinemind-ai", "provider": provider.name, "time": utcnow().isoformat()}


@app.post("/chat", response_model=ChatResponse)
@limiter.limit(settings.ai_service_rate_limit)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    started = time.perf_counter()
    request_id = str(uuid.uuid4())
    base = logging.getLogger("cinemind_ai.request")

    try:
        result = await provider.chat(
            system_prompt=body.system_prompt,
            messages=body.messages,
            registry=registry,
        )
    except Exception as exc:  # provider failure must not crash the API
        base.error(
            {
                "requestId": request_id,
                "phase": "provider",
                "error": type(exc).__name__,
            },
            "provider call failed",
        )
        raise HTTPException(status_code=502, detail="Model provider unavailable") from exc

    duration_ms = int((time.perf_counter() - started) * 1000)

    # Concise operational summary. No chain-of-thought, no prompts, no reasoning.
    summary: dict[str, object] = {
        "tool_calls": [
            {
                "name": c.name,
                "duration_ms": None,
                "ok": True,
            }
            for c in result.tool_calls
        ],
        "facts_cited": len(result.cited_facts),
        "confidence": _confidence(result.cited_facts),
    }
    base.info(
        {
            "requestId": request_id,
            "provider": provider.name,
            "tools": [c.name for c in result.tool_calls],
            "duration_ms": duration_ms,
            "facts": len(result.cited_facts),
        },
        "chat completed",
    )

    return ChatResponse(
        request_id=request_id,
        reply=_assistant_message(result.text, result.cited_facts),
        provider=provider.name,
        tool_calls=result.tool_calls,
        started_at=utcnow(),
        duration_ms=duration_ms,
        summary=summary,
    )


@app.post("/sanitize")
@limiter.limit(settings.ai_service_rate_limit)
def sanitize(request: Request, payload: dict) -> JSONResponse:
    """Isolate facts from web content. Returns bounded excerpts only."""
    source_url = str(payload.get("source_url", ""))
    content = str(payload.get("content", ""))[:200_000]
    if not content:
        raise HTTPException(status_code=422, detail="content is required")
    facts = extract_facts_from_text(content, source_url=source_url)
    return JSONResponse(
        {
            "extracted_facts": [f.model_dump() for f in facts],
            "note": "instruction-like content was discarded, not passed through",
        }
    )


def _assistant_message(text: str, facts: list[Fact]) -> object:
    return {
        "role": "assistant",
        "content": text,
        "cited_facts": [f.model_dump(mode="json") for f in facts],
    }


def _confidence(facts: list[Fact]) -> float:
    if not facts:
        return 0.0
    return round(sum(f.provenance.confidence for f in facts) / len(facts), 3)