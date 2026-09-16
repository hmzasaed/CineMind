from __future__ import annotations

import logging
from typing import Protocol

from .config import Settings
from .models import ChatMessage, ProviderResult
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
    """Select a provider purely from configuration.

    Rule-based is the offline, deterministic fallback (tests / zero-config dev).
    openai, groq, mistral, and gemini all use the OpenAI-compatible protocol and
    are configured with their respective free-tier API keys and models.
    """
    from .providers_compat import OpenAiCompatProvider

    spec = _compat_spec(settings)
    if spec is not None:
        return OpenAiCompatProvider(**spec)

    from .providers_rules import RuleBasedProvider

    logger.warning("Using RuleBasedProvider (offline, deterministic). Not an LLM.")
    return RuleBasedProvider(registry)


def _compat_spec(settings: Settings) -> dict | None:
    """Return kwargs for OpenAiCompatProvider for the configured provider, or None."""
    openai_base = "https://api.openai.com/v1"
    groq_base = "https://api.groq.com/openai/v1"
    mistral_base = "https://api.mistral.ai/v1"
    gemini_base = "https://generativelanguage.googleapis.com/v1beta/openai"

    # Each key must be present with the matching provider; unknown providers
    # fall through to the rule-based default so the service still boots.
    providers = {
        "openai": (settings.openai_api_key, settings.openai_model, openai_base),
        "groq": (settings.groq_api_key, settings.groq_model, groq_base),
        "mistral": (settings.mistral_api_key, settings.mistral_model, mistral_base),
        "gemini": (settings.gemini_api_key, settings.gemini_model, gemini_base),
    }
    entry = providers.get(settings.llm_provider)
    if entry is None:
        return None
    api_key, model, base_url = entry
    if not api_key:
        raise RuntimeError(f"LLM_PROVIDER={settings.llm_provider} requires an API key")
    return {
        "provider_name": settings.llm_provider,
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "timeout_seconds": settings.provider_timeout_seconds,
    }