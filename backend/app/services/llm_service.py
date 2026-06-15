import json
from functools import lru_cache
from typing import Any

import httpx

from app.config import get_settings


class LLMNotConfiguredError(Exception):
    """LLM не настроена: отсутствует LLM_API_KEY или LLM_MODEL."""


class LLMError(Exception):
    """Ошибка обращения к LLM или разбора её ответа."""


class LLMTimeoutError(LLMError):
    """LLM не ответила за отведённое время."""


def _strip_code_fences(text: str) -> str:
    """Убирает обёртку ```...``` вокруг ответа, если модель её добавила."""
    t = text.strip()
    if t.startswith("```") and t.endswith("```"):
        first_newline = t.find("\n")
        if first_newline != -1:
            return t[first_newline + 1 : -3].strip()
    return t


class LLMService:
    """Клиент OpenAI-compatible Chat Completions API."""

    def __init__(
        self, *, api_key: str, base_url: str, model: str, timeout_seconds: float
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.model)

    def _chat(self, system_prompt: str, user_content: str, temperature: float) -> str:
        if not self.is_configured:
            raise LLMNotConfiguredError(
                "LLM не настроена: задайте LLM_API_KEY и LLM_MODEL в .env"
            )
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "temperature": temperature,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                },
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(
                f"LLM не ответила за {self.timeout_seconds:g} с"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise LLMError(
                f"LLM вернула ошибку {exc.response.status_code}: "
                f"{exc.response.text[:200]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Не удалось обратиться к LLM: {exc}") from exc

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("LLM вернула ответ неожиданной структуры") from exc
        if not isinstance(content, str) or not content.strip():
            raise LLMError("LLM вернула пустой ответ")
        return content

    def chat_json(
        self, system_prompt: str, user_payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Запрос с ожиданием JSON-объекта в ответе."""
        content = self._chat(
            system_prompt,
            json.dumps(user_payload, ensure_ascii=False),
            temperature=0.2,
        )
        text = _strip_code_fences(content)
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise LLMError("LLM вернула ответ без JSON-объекта")
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMError("LLM вернула невалидный JSON") from exc
        if not isinstance(parsed, dict):
            raise LLMError("LLM вернула JSON, но не объект")
        return parsed

    def chat_markdown(self, system_prompt: str, user_payload: dict[str, Any]) -> str:
        """Запрос с ожиданием Markdown-текста в ответе."""
        content = self._chat(
            system_prompt,
            json.dumps(user_payload, ensure_ascii=False),
            temperature=0.5,
        )
        return _strip_code_fences(content)


@lru_cache
def get_llm_service() -> LLMService:
    settings = get_settings()
    return LLMService(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
    )
