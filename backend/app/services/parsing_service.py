import json
from pathlib import Path

async def parse_document(path: str) -> dict:
    p = Path(path)
    # naive preview: filename & size; later: real text extraction
    stat = p.stat()
    return {"filename": p.name, "size_bytes": stat.st_size, "preview": "Parsing stub (Week 1)"}
