import json
from pathlib import Path
from app.models.schemas.slide import Deck, Slide

OUT = Path(__file__).resolve().parents[1] / "docs" / "schema"
OUT.mkdir(parents=True, exist_ok=True)

deck_schema = Deck.model_json_schema()
slide_schema = Slide.model_json_schema()

(OUT / "deck.schema.json").write_text(json.dumps(deck_schema, indent=2))
(OUT / "slide.schema.json").write_text(json.dumps(slide_schema, indent=2))

print("Wrote:", OUT / "deck.schema.json")
print("Wrote:", OUT / "slide.schema.json")
