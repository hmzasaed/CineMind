"""Real (async) OpenAI chat provider with tool calling.

The model may only emit tool_use requests; every fact in the final answer is
expected to be backed by a tool result annotated with provenance. If the model
refuses to call tools when they were offered, the answer is returned WITHOUT
facts and confidence is lowered so callers never mistake prose for facts.
"""

from __future__ import annotations

import json
import time

from openai import AsyncOpenAI

from .models import ChatMessage, Fact, ProviderResult, Role, ToolCall
from .tools import ToolRegistry


class OpenAiProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float) -> None:
        self._client = AsyncOpenAI(api_key=api_key, timeout=timeout_seconds)
        self._model = model

    def _tools_json(self, registry: ToolRegistry) -> list[dict]:
        tools = []
        for name in registry.names():
            tool = registry.get(name)
            if tool is None:
                continue
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.schema.model_json_schema(),
                    },
                }
            )
        return tools

    def _messages_json(self, system_prompt: str, messages: list[ChatMessage]) -> list[dict]:
        out: list[dict] = []
        if system_prompt:
            out.append({"role": "system", "content": system_prompt})
        for m in messages:
            out.append({"role": m.role.value, "content": m.content})
        return out

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        registry: ToolRegistry,
    ) -> ProviderResult:
        calls: list[ToolCall] = []
        facts: list[Fact] = []

        msgs: list[dict] = [
            {"role": Role.SYSTEM.value, "content": _SYSTEM_INSTRUCTION},
            *self._messages_json(system_prompt, messages),
        ]
        tools = self._tools_json(registry)

        for _ in range(4):  # bounded tool-call loop
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=msgs,
                tools=tools or None,
                tool_choice="auto" if tools else None,
            )
            choice = resp.choices[0].message
            tool_calls = choice.tool_calls or []
            if not tool_calls:
                text = choice.content or ""
                return ProviderResult(text=text, tool_calls=calls, cited_facts=facts)

            assistant_msg: dict = {"role": "assistant", "content": choice.content, "tool_calls": []}
            for tc in tool_calls:
                call = ToolCall(name=tc.function.name or "", arguments=_decode_args(tc.function.arguments))
                calls.append(call)
                assistant_msg["tool_calls"].append(
                    {"id": tc.id, "type": "function", "function": {"name": call.name, "arguments": json.dumps(call.arguments)}}
                )
            msgs.append(assistant_msg)

            for tc in tool_calls:
                result = await registry.run(tc.function.name or "", _decode_args(tc.function.arguments))
                facts.extend(result.facts)
                msgs.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps({"ok": result.ok, "facts": [f.model_dump(mode="json") for f in result.facts] or result.error_code}),
                    }
                )

        return ProviderResult(text="Stopped after the tool-call limit.", tool_calls=calls, cited_facts=facts)


_SYSTEM_INSTRUCTION = (
    "You are CineMind, a movie assistant. You NEVER state movie facts from memory. "
    "To answer any factual question you MUST call lookup_movie and cite the tool result. "
    "If you cannot confirm a fact with a tool, say you could not verify it. "
    "Never fabricate ratings, years, cast, or plot details."
)


def _decode_args(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}