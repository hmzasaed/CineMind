"""Deterministic offline provider for tests and zero-config runs.

Uses no LLM. Extracts quoted ("...") series of words from the user's last
message, runs the lookup tool, and composes a response that only restates
retrieved facts. Clearly labeled; never deployed as a real assistant.
"""

from __future__ import annotations

import re

from .models import ChatMessage, ProviderResult, Role, ToolCall
from .tools import ToolRegistry

QUOTED = re.compile(r'"([^"]{2,120})"')


class RuleBasedProvider:
    name = "rule-based"

    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        registry: ToolRegistry,
    ) -> ProviderResult:
        del system_prompt  # not used by the deterministic provider
        last_user = next((m for m in reversed(messages) if m.role == Role.USER), None)
        if last_user is None:
            return ProviderResult(text="I need a user message to look something up.", tool_calls=[])

        quoted = QUOTED.findall(last_user.content)
        if not quoted:
            return ProviderResult(
                text="This offline provider can only look up quoted movie titles, e.g. \"Inception\".",
                tool_calls=[],
            )

        calls: list[ToolCall] = []
        facts = []
        for title in quoted[:3]:
            call = ToolCall(name="lookup_movie", arguments={"title": title})
            result = await registry.run(call.name, call.arguments)
            calls.append(call)
            facts.extend(result.facts)

        if not facts:
            return ProviderResult(
                text="No structured movie facts matched those titles.",
                tool_calls=calls,
            )

        lines = ["Facts retrieved from the structured data source:"]
        for f in facts:
            title = f.value.get("title") or f.value.get("id")
            year = f.value.get("releaseYear")
            lines.append(f"- {title} ({year}) — rating {_rating(f)}; provenance {f.provenance.source_name}")
        return ProviderResult(text="\n".join(lines), tool_calls=calls, cited_facts=facts)


def _rating(f) -> str:
    rating = f.value.get("rating")
    if not rating:
        return "not available"
    return f"{rating.get('average'):.1f} from {rating.get('votes')} votes"