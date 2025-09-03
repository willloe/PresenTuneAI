from __future__ import annotations
import json, time
from pathlib import Path
from typing import Any, Dict, List, Tuple

LIB_PATH = Path(__file__).resolve().parent.parent / "libraries" / "layouts.json"

_cache: Dict[str, Any] = {}
_cache_mtime: float | None = None

def _load() -> Dict[str, Any]:
    global _cache, _cache_mtime
    mtime = LIB_PATH.stat().st_mtime
    if _cache_mtime != mtime:
        with LIB_PATH.open("r", encoding="utf-8") as f:
            _cache = json.load(f)
        _cache_mtime = mtime
    return _cache

def list_layouts() -> Dict[str, Any]:
    return _load()

def filter_layouts(components: Dict[str, int], top_k: int = 1) -> List[str]:
    """
    Heuristic scoring: prefer layouts whose 'supports' is closest to desired
    counts (text_count, image_count). Lower score is better.
    """
    lib = _load()
    items = lib.get("items", [])
    want_text = max(0, int(components.get("text_count", 0)))
    want_img  = max(0, int(components.get("image_count", 0)))

    scored: List[Tuple[float, str]] = []
    for it in items:
        sup = it.get("supports", {})
        sup_text = int(sup.get("text_count", 0))
        sup_img  = int(sup.get("image_count", 0))

        # L2 distance with small penalty if layout lacks a needed channel
        d_text = (want_text - sup_text)
        d_img  = (want_img  - sup_img)
        score = (d_text*d_text + d_img*d_img) ** 0.5

        # prefer heavier weights
        w = float(it.get("weight", 1.0))
        score = score / max(0.1, w)

        scored.append((score, it["id"]))

    scored.sort(key=lambda t: t[0])
    return [lid for _, lid in scored[: max(1, top_k)]]
