import hashlib
import json
from typing import Any


def context_hash(context: dict[str, Any]) -> str:
    """Стабильный hash context_json: порядок ключей не влияет на результат."""
    payload = json.dumps(
        context, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
