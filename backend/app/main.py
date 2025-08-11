from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI(title="PresenTuneAI API", version="0.1.0")

class OutlineRequest(BaseModel):
    text: str
    slide_count: int = 6

class Slide(BaseModel):
    title: str
    bullets: List[str] = []
    image_hint: str | None = None

class ExportRequest(BaseModel):
    slides: List[Slide]
    format: str = "pptx"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if file.content_type not in {"application/pdf",
                                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}:
        raise HTTPException(status_code=415, detail="Only PDF or DOCX supported")
    # Week 1 stub: don't parse yet, just echo name
    return {"filename": file.filename, "text": "", "metadata": {"size": None}}

@app.post("/outline")
def outline(req: OutlineRequest):
    # Week 1/2 placeholder outline (no model needed yet)
    slides = [
        Slide(title=f"Slide {i+1}", bullets=[f"Point {j+1}" for j in range(3)])
        for i in range(req.slide_count)
    ]
    return {"slides": slides}

@app.post("/export")
def export(req: ExportRequest):
    # Week 1 stub: we’ll implement PPTX later
    return {"ok": True, "format": req.format, "slide_count": len(req.slides)}
