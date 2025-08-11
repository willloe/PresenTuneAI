# backend/app/api/v1/endpoints/schema.py
from fastapi import APIRouter
from app.models.schemas.slide import Slide, Deck

router = APIRouter(tags=["schema"])

@router.get("/schema/slide")
def schema_slide():
    return Slide.model_json_schema()

@router.get("/schema/deck")
def schema_deck():
    return Deck.model_json_schema()
