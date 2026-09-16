"""Structured fact tools.

Every tool goes through a typed schema and returns pydantic-validated facts.
Tools call ONLY deterministic services (the CineMind backend / approved APIs).
The LLM never invents facts; it can only request tool calls and cite results.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Protocol

import httpx
from pydantic import BaseModel, ValidationError

from .models import Fact, Provenance, SourceKind, ToolResult, utcnow

ToolFn = Callable[..., Awaitable[ToolResult]]


class Tool(Protocol):
    name: str
    description: str
    schema: type[BaseModel]

    async def run(self, arguments: dict) -> ToolResult: ...


class LookupMovieArgs(BaseModel):
    title: str
    year: int | None = None


class BackendMovieLookup(BaseModel):
    """Schema of the backend's /movies response subset we accept."""

    movies: list[dict]
    provenance: dict | None = None


class LookupMovieTool:
    name = "lookup_movie"
    description = "Look up structured movie facts by title from the approved movie data source."
    schema = LookupMovieArgs

    def __init__(self, base_url: str, timeout_seconds: float = 10.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds

    async def run(self, arguments: dict) -> ToolResult:
        started = time.perf_counter()
        try:
            args = LookupMovieArgs(**arguments)
        except ValidationError as exc:
            return _failed("lookup_movie", "VALIDATION_ERROR", started, exc)
        params = {"title": args.title, "limit": "5"}
        if args.year is not None:
            params["year"] = str(args.year)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.get(f"{self._base_url}/movies", params=params)
        except httpx.HTTPError as exc:
            return _failed("lookup_movie", "BACKEND_UNREACHABLE", started, exc)
        if res.status_code != 200:
            return _failed("lookup_movie", f"BACKEND_HTTP_{res.status_code}", started, None)
        try:
            body = BackendMovieLookup(**res.json())
        except ValidationError:
            return _failed("lookup_movie", "BACKEND_INVALID_PAYLOAD", started, None)

        source = body.provenance or {}
        # Facts are re-stamped with provenance we received; we never add our own guesses.
        facts = [
            Fact(
                value=m,
                provenance=Provenance(
                    source_kind=SourceKind(source.get("sourceKind", "api")),
                    source_name=source.get("sourceName", "cinemind-backend"),
                    source_id=source.get("sourceId", f"backend:movie:{m.get('id')}"),
                    retrieved_at=utcnow(),
                    confidence=float(source.get("confidence", 0.5)),
                ),
            )
            for m in body.movies
        ]
        return ToolResult(
            name="lookup_movie",
            ok=True,
            facts=facts,
            duration_ms=int((time.perf_counter() - started) * 1000),
        )


def _failed(name: str, code: str, started: float, exc: BaseException | None) -> ToolResult:
    return ToolResult(
        name=name,
        ok=False,
        error_code=code,
        duration_ms=int((time.perf_counter() - started) * 1000),
    )


class ToolRegistry:
    def __init__(self, tools: list[Tool]) -> None:
        self._tools = {t.name: t for t in tools}

    def names(self) -> list[str]:
        return list(self._tools)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    async def run(self, name: str, arguments: dict) -> ToolResult:
        tool = self.get(name)
        if tool is None:
            return ToolResult(name=name, ok=False, error_code="UNKNOWN_TOOL")
        return await tool.run(arguments)


def build_registry(base_url: str, timeout_seconds: float) -> ToolRegistry:
    return ToolRegistry([LookupMovieTool(base_url, timeout_seconds)])