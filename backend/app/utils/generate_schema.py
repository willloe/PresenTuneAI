from __future__ import annotations
import json, sys
from pathlib import Path

THIS = Path(__file__).resolve()
BACKEND_DIR = THIS.parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models.schemas.slide import Deck, Slide  # noqa: E402
from app.core.version import SCHEMA_VERSION       # noqa: E402

def write_json(path: Path, data: dict) -> None:
    data.setdefault("$schema", "https://json-schema.org/draft/2020-12/schema")
    data.setdefault("x-schema-version", SCHEMA_VERSION)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_text(payload, encoding="utf-8")
    print(f"wrote {path} ({len(payload.encode('utf-8'))} bytes)")

def main() -> None:
    root = BACKEND_DIR.parent
    out = root / "docs" / "schema"

    deck = Deck.model_json_schema()
    slide = Slide.model_json_schema()

    deck["$id"] = "https://presen-tune-ai.local/schema/deck.schema.json"
    slide["$id"] = "https://presen-tune-ai.local/schema/slide.schema.json"

    write_json(out / "deck.schema.json", deck)
    write_json(out / "slide.schema.json", slide)

if __name__ == "__main__":
    main()
