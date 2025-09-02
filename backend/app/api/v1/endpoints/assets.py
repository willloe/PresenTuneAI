from __future__ import annotations
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.models.schemas.assets import AssetList, Asset
from app.services.asset_store import load_assets, get_asset

router = APIRouter(prefix="/assets", tags=["assets"])

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
    abs_path = os.path.abspath(a.rel_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=410, detail="Asset file missing")
    return FileResponse(abs_path, media_type="image/png", filename=a.filename)
