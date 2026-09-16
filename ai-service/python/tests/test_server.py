from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from cinemind_ai import server
from cinemind_ai.config import Settings
from cinemind_ai.models import Fact, Provenance, SourceKind, ToolResult
from cinemind_ai.tools import ToolRegistry


def _fact(title: str) -> Fact:
    return Fact(
        value={"id": title.lower(), "title": title, "releaseYear": 2010, "rating": {"average": 8.8, "votes": 100}},
        provenance=Provenance(
            source_kind=SourceKind.API,
            source_name="tmdb",
            source_id=f"tmdb:movie:{title.lower()}",
            retrieved_at=datetime.now(UTC),
            confidence=0.99,
        ),
    )


class FakeLookupTool:
    name = "lookup_movie"
    description = "test tool"
    schema = type("Args", (), {"model_json_schema": lambda s: {}})

    async def run(self, arguments: dict[str, Any]) -> ToolResult:
        title = str(arguments.get("title", ""))
        return ToolResult(name="lookup_movie", ok=True, facts=[_fact(title)])


def make_client() -> TestClient:
    settings = Settings()
    server.registry = ToolRegistry([FakeLookupTool()])
    server.provider = server.build_provider(settings, server.registry)
    return TestClient(server.app)


def test_health_reports_provider_name() -> None:
    with make_client() as client:
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["provider"] == "rule-based"


def test_chat_returns_facts_with_provenance_and_no_chain_of_thought() -> None:
    with make_client() as client:
        res = client.post(
            "/chat",
            json={"user_id": "u1", "messages": [{"role": "user", "content": 'lookup "Inception"'}]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["provider"] == "rule-based"
        assert body["tool_calls"][0]["name"] == "lookup_movie"
        assert "Inception" in body["reply"]["content"]
        cited = body["reply"]["cited_facts"]
        assert len(cited) == 1
        assert cited[0]["provenance"]["source_kind"] == "api"
        assert cited[0]["provenance"]["confidence"] == 0.99
        # The public model has no reasoning / chain-of-thought field at all.
        assert "reasoning" not in body
        assert "hidden" not in body


def test_chat_rejects_bad_message_shape() -> None:
    with make_client() as client:
        res = client.post("/chat", json={"user_id": "u1", "messages": [{"role": "system", "content": "hi"}]})
        assert res.status_code == 422


def test_chat_without_quoted_title_is_safe() -> None:
    with make_client() as client:
        res = client.post("/chat", json={"user_id": "u1", "messages": [{"role": "user", "content": "hello"}]})
        assert res.status_code == 200
        assert "can only look up quoted" in res.json()["reply"]["content"]


def test_sanitize_drops_instruction_blocks() -> None:
    html = '<html><body><p>"Inception" came out in 2010</p>' "</body></html>"
    with make_client() as client:
        payload = {"source_url": "https://example.com/review", "content": html}
        res = client.post("/sanitize", json=payload)
        assert res.status_code == 200
        assert len(res.json()["extracted_facts"]) == 1
        assert "came out in 2010" in res.json()["extracted_facts"][0]["text"]