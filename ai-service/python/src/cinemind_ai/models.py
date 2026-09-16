from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Role(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class SourceKind(StrEnum):
    DATABASE = "database"
    API = "api"
    USER_DATA = "user_data"
    ML_MODEL = "ml_model"
    WEB_RESEARCH = "web_research"
    STATIC = "static"
    DETERMINISTIC = "deterministic"


class Provenance(BaseModel):
    """Where a fact came from. LLM output is never a source kind."""

    source_kind: SourceKind
    source_name: str
    source_id: str
    retrieved_at: datetime
    confidence: float = Field(ge=0.0, le=1.0)
    ref: str | None = None


class Fact(BaseModel):
    """A structured fact bound to its provenance. Shape is source-dependent."""

    value: dict[str, Any]
    provenance: Provenance


class ChatMessage(BaseModel):
    role: Role
    content: str
    cited_facts: list[Fact] = Field(default_factory=list)


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    name: str
    ok: bool
    facts: list[Fact] = Field(default_factory=list)
    error_code: str | None = None
    duration_ms: int = 0


class ChatRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    messages: list[ChatMessage] = Field(min_length=1, max_length=32)
    # Bounded, sandboxed instruction text. This is trusted-env content only.
    system_prompt: str = Field(default="", max_length=4000)

    @field_validator("messages")
    @classmethod
    def messages_must_end_with_user(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if messages[-1].role != Role.USER:
            raise ValueError("last message must be from the user")
        return messages


class ChatResponse(BaseModel):
    """Public response. Contains ONLY the assistant turn, cited facts, and a
    concise operational summary. No chain-of-thought, no hidden reasoning."""

    request_id: str
    reply: ChatMessage
    provider: str
    tool_calls: list[ToolCall]
    started_at: datetime
    duration_ms: int
    # Summary of what ran; bounded and safe for debugging.
    summary: dict[str, Any] = Field(default_factory=dict)


class ProviderResult(BaseModel):
    """Provider output. Only the assistant message and used tools are kept."""

    text: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    cited_facts: list[Fact] = Field(default_factory=list)


def utcnow() -> datetime:
    return datetime.now(UTC)