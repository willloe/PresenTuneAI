from __future__ import annotations
import os, mimetypes
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from app.models.schemas.assets import AssetList, Asset
from app.services.asset_store import load_assets, get_asset
from app.core.config import settings
from app.core.auth import require_token

router = APIRouter(
    prefix="/assets",
    tags=["assets"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else [])
)

def _abs_from_rel(rel_path: str) -> Path:
    p = Path(rel_path)
    return p if p.is_absolute() else (Path.cwd() / p).resolve()

@router.get("", response_model=AssetList)
def list_assets(upload_id: str):
    items = load_assets(upload_id)
    return AssetList(items=items, count=len(items))

@router.get("/{asset_id}", response_model=Asset)
def get_asset_meta(asset_id: str, upload_id: str):
    a = get_asset(upload_id, asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    return a

@router.get("/{asset_id}/file")
def get_asset_file(asset_id: str, upload_id: str):
    a = get_asset(upload_id, asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    abs_path = _abs_from_rel(a.rel_path)
    if not abs_path.exists():
        raise HTTPException(status_code=410, detail="Asset file missing")
    mt = mimetypes.guess_type(str(a.filename))[0] or "application/octet-stream"
    return FileResponse(abs_path, media_type=mt, filename=a.filename)
