from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def get_prompt(name: str) -> str:
    """Читает prompt-файл backend/app/prompts/{name}.md."""
    path = PROMPTS_DIR / f"{name}.md"
    if not path.is_file():
        raise FileNotFoundError(f"Prompt-файл не найден: {path}")
    return path.read_text(encoding="utf-8").strip()
