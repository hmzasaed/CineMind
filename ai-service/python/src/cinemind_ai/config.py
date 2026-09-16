from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server settings. All values come from the environment; nothing is hardcoded."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_service_port: int = 8000
    ai_service_log_level: str = "info"
    ai_service_rate_limit: str = "30/minute"

    cinemind_backend_base_url: str = "http://localhost:3000"
    llm_provider: str = "rule-based"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    provider_timeout_seconds: float = 30.0
    backend_timeout_seconds: float = 10.0

    @property
    def rate_limit_max(self) -> int:
        try:
            return int(self.ai_service_rate_limit.split("/")[0])
        except (ValueError, IndexError):
            return 30

    @property
    def rate_limit_window(self) -> str:
        parts = self.ai_service_rate_limit.split("/")
        return parts[1] if len(parts) > 1 else "minute"


@lru_cache
def get_settings() -> Settings:
    return Settings()