from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.models.schemas.slide import Slide, Deck
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.upload import UploadMeta, ParsedPreview
from app.models.schemas.layouts import LayoutItem, LayoutLibrary, LayoutFilterRequest
from app.models.schemas.editor import EditorDoc, EditorSlide, EditorLayer
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

@router.get("/layout_item", summary="JSON Schema for LayoutItem")
def schema_layout_item():
    return JSONResponse(_decorate(LayoutItem.model_json_schema(), "layout_item"))

@router.get("/layout_library", summary="JSON Schema for LayoutLibrary")
def schema_layout_library():
    return JSONResponse(_decorate(LayoutLibrary.model_json_schema(), "layout_library"))

@router.get("/layout_filter_request", summary="JSON Schema for LayoutFilterRequest")
def schema_layout_filter_request():
    return JSONResponse(_decorate(LayoutFilterRequest.model_json_schema(), "layout_filter_request"))

@router.get("/editor_doc", summary="JSON Schema for EditorDoc")
def schema_editor_doc():
    return JSONResponse(_decorate(EditorDoc.model_json_schema(), "editor_doc"))

@router.get("/editor_slide", summary="JSON Schema for EditorSlide")
def schema_editor_slide():
    return JSONResponse(_decorate(EditorSlide.model_json_schema(), "editor_slide"))

@router.get("/editor_layer", summary="JSON Schema for EditorLayer")
def schema_editor_layer():
    return JSONResponse(_decorate(EditorLayer.model_json_schema(), "editor_layer"))