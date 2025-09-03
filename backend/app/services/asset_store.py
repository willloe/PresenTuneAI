from __future__ import annotations

from pathlib import Path
from typing import List, Optional
import json
import os

from app.core.config import settings
from app.models.schemas.assets import Asset

IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}

def _assets_dir(upload_id: str) -> Path:
    return (settings.STORAGE_DIR / upload_id / "assets").resolve()

def _index_path(upload_id: str) -> Path:
    return _assets_dir(upload_id) / "index.json"

def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    os.replace(tmp, path)  # atomic on Linux

def load_assets(upload_id: str) -> List[Asset]:
    """
    Reads assets index. Tolerates:
    - missing file => []
    - {items:[...]} or bare [...].
    - corrupted JSON => [] (no crash)
    """
    idx = _index_path(upload_id)
    if not idx.exists():
        return []

    try:
        raw = json.loads(idx.read_text(encoding="utf-8") or "[]")
        items = raw.get("items") if isinstance(raw, dict) else raw
        return [Asset.model_validate(x) for x in (items or [])]
    except Exception:
        # If the file was truncated/corrupt, return empty rather than 500.
        return []

def save_assets(upload_id: str, items: List[Asset]) -> None:
    """
    Writes assets index atomically using JSON-safe dumps (handles datetimes).
    Shape: { items: [...], count: N }
    """
    payload = {
        "items": [a.model_dump(mode="json") for a in items],
        "count": len(items),
    }
    _atomic_write_json(_index_path(upload_id), payload)

def get_asset(upload_id: str, asset_id: str) -> Optional[Asset]:
    for a in load_assets(upload_id):
        if a.id == asset_id:
            return a
    return None
