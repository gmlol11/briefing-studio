from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Конфигурация приложения через переменные окружения / .env."""

    app_name: str = "Briefing Studio API"
    app_env: str = "local"
    debug: bool = False
    database_url: str = "postgresql+psycopg://briefing:briefing@localhost:5432/briefing"
    cors_origins: str = "http://localhost:5173"

    # LLM (OpenAI-compatible Chat Completions API)
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = ""
    llm_timeout_seconds: float = 60.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
