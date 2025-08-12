from fastapi import APIRouter
from app.models.schemas.slide import Slide, Deck
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.upload import UploadMeta, ParsedPreview

router = APIRouter(tags=["schema"])

@router.get("/schema/slide")
def schema_slide():
    return Slide.model_json_schema()

@router.get("/schema/deck")
def schema_deck():
    return Deck.model_json_schema()

@router.get("/schema/outline_request")
def schema_outline_request():
    return OutlineRequest.model_json_schema()

@router.get("/schema/upload")
def schema_upload_meta():
    # UploadResponse is an alias of UploadMeta for week 1
    return UploadMeta.model_json_schema()

@router.get("/schema/upload_parsed")
def schema_upload_parsed():
    return ParsedPreview.model_json_schema()
