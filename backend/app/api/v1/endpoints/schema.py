from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.models.schemas.slide import Slide, Deck
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.upload import UploadMeta, ParsedPreview
from app.core.version import SCHEMA_VERSION

router = APIRouter(prefix="/schema", tags=["schema"])

def _decorate(schema: dict, name: str) -> dict:
    """Attach stable $id + version markers so tools can verify provenance."""
    s = dict(schema)
    s["$id"] = f"https://presen-tune-ai.local/schema/{name}.schema.json"
    s["x-schema-version"] = SCHEMA_VERSION
    return s

@router.get("/slide", summary="JSON Schema for Slide")
def schema_slide():
    return JSONResponse(_decorate(Slide.model_json_schema(), "slide"))

@router.get("/deck", summary="JSON Schema for Deck")
def schema_deck():
    return JSONResponse(_decorate(Deck.model_json_schema(), "deck"))

@router.get("/outline_request", summary="JSON Schema for OutlineRequest")
def schema_outline_request():
    return JSONResponse(_decorate(OutlineRequest.model_json_schema(), "outline_request"))

@router.get("/upload", summary="JSON Schema for UploadMeta (aka UploadResponse)")
def schema_upload_meta():
    return JSONResponse(_decorate(UploadMeta.model_json_schema(), "upload"))

@router.get("/upload_parsed", summary="JSON Schema for ParsedPreview")
def schema_upload_parsed():
    return JSONResponse(_decorate(ParsedPreview.model_json_schema(), "upload_parsed"))
