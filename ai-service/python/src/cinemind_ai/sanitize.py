"""Isolation of untrusted web content.

Web pages are treated as untrusted data: text that looks like instructions
(system blocks, prompt directives, script tags) is separated from factual
content and discarded. Only bounded factual excerpts with their source URL are
kept. This prevents prompt-injection style content from reaching the LLM.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

INSTRUCTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"<\s*instructions?\s*>.*?<\s*/\s*instructions?\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*system\s*>.*?<\s*/\s*system\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*style\b[^>]*>.*?<\s*/\s*style\s*>", re.IGNORECASE | re.DOTALL),
]

DIRECTIVE_LINES: list[re.Pattern[str]] = [
    re.compile(r"^\s*(ignore|disregard|pretend|your role is|you are now|from now on)", re.IGNORECASE),
]


class ExtractedFact(BaseModel):
    text: str = Field(max_length=2000)
    source_url: str = Field(max_length=2000)
    discarded_instruction_blocks: int


def _strip_instruction_blocks(text: str) -> tuple[str, int]:
    remaining = text
    dropped = 0
    for pattern in INSTRUCTION_PATTERNS:
        removed = len(pattern.findall(remaining))
        dropped += removed
        remaining = pattern.sub("", remaining)
    return remaining, dropped


def extract_facts_from_text(raw_html_or_text: str, *, source_url: str, max_excerpts: int = 8) -> list[ExtractedFact]:
    """Return bounded factual excerpts; instruction-like content is dropped, not passed through."""
    stripped, dropped = _strip_instruction_blocks(raw_html_or_text)

    lines = [ln.strip() for ln in stripped.splitlines()]
    kept: list[str] = []
    for ln in lines:
        if not ln:
            continue
        if any(p.match(ln) for p in DIRECTIVE_LINES):
            dropped += 1
            continue
        if len(ln) > 2000:
            ln = ln[:2000]
        kept.append(ln)

    excerpt = " ".join(kept)[: max_excerpts * 2000]
    if not excerpt:
        return []
    return [
        ExtractedFact(
            text=excerpt,
            source_url=source_url,
            discarded_instruction_blocks=dropped,
        )
    ]