"""LLM provider interface. All providers are swapped in via configuration only."""

from __future__ import annotations

import logging
from typing import Protocol

from .config import Settings
from .models import ChatMessage, ProviderResult, ToolCall
from .tools import ToolRegistry

logger = logging.getLogger("cinemind_ai.providers")


class ChatProvider(Protocol):
    name: str

    def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        registry: ToolRegistry,
    ) -> ProviderResult: ...


def build_provider(settings: Settings, registry: ToolRegistry) -> ChatProvider:
    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("LLM_PROVIDER=openai requires OPENAI_API_KEY")
        from .providers_openai import OpenAiProvider

        return OpenAiProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    from .providers_rules import RuleBasedProvider

    logger.warning("Using RuleBasedProvider (offline, deterministic). Not an LLM.")
    return RuleBasedProvider(registry)