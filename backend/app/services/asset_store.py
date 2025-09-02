from __future__ import annotations
import os, json
from typing import List, Optional
from app.models.schemas.assets import Asset, AssetList

def _index_path(upload_id: str) -> str:
    return os.path.abspath(os.path.join("data", "uploads", upload_id, "assets", "index.json"))

def load_assets(upload_id: str) -> List[Asset]:
    p = _index_path(upload_id)
    if not os.path.exists(p):
        return []
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [Asset(**it) for it in data.get("items", [])]

def save_assets(upload_id: str, assets: List[Asset]) -> None:
    p = _index_path(upload_id)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    payload = AssetList(items=assets, count=len(assets)).model_dump()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

def get_asset(upload_id: str, asset_id: str) -> Optional[Asset]:
    for a in load_assets(upload_id):
        if a.id == asset_id:
            return a
    return None
