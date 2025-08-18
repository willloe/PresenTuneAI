# PresenTuneAI

Generate, edit, lay out, and export presentation decks from documents. Built for rapid iteration and hackathons, with clean seams to grow into a production‑ready system.

---
- **What it does:** ingest → outline → assign layouts → build editor → export PPTX exactly like the preview.  
- **Limits:** recommended 1–15 slides in UI; images must be public; background = solid color.  
- **Roadmap:** shapes, gradients, rich text spans, theme packs, multi-text-to-frames mapping.  
- **Quickstart:** docker compose up; open `:5173` ; drag a file; pick layouts; export.

## Features

- **Document extraction** (PDF/DOCX/TXT) → topic + slide outline.
- **Layout library** – fetch layout definitions from JSON, filter/rank by content fit.
- **EditorDoc builder** – compose per‑slide **layers** (title, bullets, images) using chosen layouts.
- **PPTX export** – two modes:
  - *Slides mode:* simple title + bullets + best‑effort image placement.
  - *Editor mode:* exact positioning of layers (text/image), object‑fit, background fills.
- **Frontend workflow** with 5 phases:
  1) Upload extract
  2) Outline generate
  3) Edit & assign (reorder slides, edit text, manage images)
  4) Layout selection (selected / recommended / all views)
  5) Finalize & export (visual preview + download)
- **Image tools** – attach/replace/remove images, quick “AI generate” stub.
- **Observability** – request correlation id, response timing, and Server‑Timing spans out of the box.

---

## Quick start (Docker)

```bash
docker compose up --build
# Backend:  http://localhost:8000/v1
# Frontend: http://localhost:5173
```

Environment variables live in `.env`. See **config.md** for all options.

---

## Repository layout

```
backend/
  app/
    api/v1/endpoints/
      editor.py       # build EditorDoc from a deck + layout selections
      export.py       # export to PPTX
      layouts.py      # serve/filter layout library (JSON-backed)
      outline.py      # outline generation (stub or model-backed)
      upload.py       # file upload & document parsing
      health.py       # health + meta
    core/
      config.py       # pydantic settings from .env
      telemetry.py    # span/aspan helpers for Server-Timing
      logging.py
    models/schemas/   # pydantic models shared across routes
    workers/          # retention cleanup loop
frontend/
  src/
    components/
      LayoutPicker.tsx   # selected/recommended/all UX
      EditorPreview.tsx  # visual preview for EditorDoc layers
      SlideCard.tsx      # edit text, images; reorder; regen
    lib/api.ts           # typed fetch helpers
    App.tsx              # 5-phase flow
schema/                  # public JSON Schemas
```

---

## HTTP API (short)

The base path is **`/v1`**. See **api.md** for complete details.

- `GET /health` – status + meta (e.g., schema version).
- `POST /upload` – upload a file; returns parsed text & media.
- `POST /outline` – generate slides from topic/text.
- `GET /layouts` – return the layout library (loaded from `app/static/layouts/layouts.json` if present, otherwise defaults).
- `POST /layouts/filter` – rank layouts for a pair of counts: `{ text_count, image_count }`.
- `POST /editor/build` – build an **EditorDoc** from a deck + selections.
  - Accepts optional `Idempotency-Key` header. Responses are cached for 5 minutes for the same key.
- `POST /export` – export to PPTX; accepts either `{ slides }` or `{ editor }` (EditorDoc).

---

## Frontend flow

1. **Upload Extract** – UI posts to `/upload`, shows parsed metadata and the first images (optional).
2. **Outline Generate** – UI calls `/outline` with topic + optional extracted text.
3. **Edit & Assign** – Reorder, rename, edit bullets, and attach images (with a small gallery editor). Confirm to continue.
4. **Layout Selection** – For each slide, pick a layout.
   - The picker fetches `/layouts` and calls `/layouts/filter` per slide to build a **recommended** set. UX has three views: **selected**, **recommended**, and **all**.
5. **Finalize & Export** – UI calls `/editor/build` with selected layout ids, previews the result using `EditorPreview`, then `/export` to get a `.pptx` download.

---

## Layout library

Layouts are JSON objects that define **frames** (x, y, w, h in pixels for a 1280×720 canvas) and `supports` ranges. Example (abbreviated):

```jsonc
{
  "id": "two_col_text_image",
  "name": "Two Columns (Text + Image)",
  "supports": { "text_min": 1, "text_max": 10, "images_min": 1, "images_max": 2 },
  "frames": {
    "title": { "x": 80, "y": 64, "w": 1120, "h": 80 },
    "bullets": [{ "x": 80, "y": 170, "w": 540, "h": 360 }],
    "images": [{ "x": 660, "y": 170, "w": 540, "h": 360 }]
  }
}
```

Put a `layouts.json` under `backend/app/static/layouts/` to override/extend the in‑memory defaults. Use `GET /layouts?reload=true` to reload at runtime.

---

## Export

- **Slides mode** – uses titles/bullets and drops the first image (if present) into a fixed box.
- **Editor mode** – honors each layer’s frame precisely. Supported layer kinds:
  - `textbox` with font, weight, color, and align.
  - `image` with `fit`: `cover` (default), `contain`, or `fill`.
- Slide size: set from the EditorDoc page (`width`/`height` in px).

The exporter writes to `STORAGE_DIR/exports` and returns a path that the UI turns into a download link.

---

## Observability

See **observability.md** for details on `X-Request-Id`, `X-Response-Time-Ms`, and `Server-Timing` spans. The UI shows the request id near the preview header for quick copy/paste.

---

## Development

- **Config** – tweak `.env` (CORS, auth toggle, image provider stub, retention, etc.). See **config.md**.
- **Docker** – `docker compose up --build` runs both services.
- **Static assets** – optional layout preview PNGs can live under `backend/app/static/layouts/` and are served at `/static/layouts/...` (your layouts may reference them via `preview_url`).

---

## Known limitations

- EditorDoc currently supports **title, bullets, images**. More layer kinds (shapes, tables, charts) can be added in `export/editor` and the frontend preview.
- The image “AI Generate” is a placeholder that uses `picsum.photos`. Swap in a real provider behind `FEATURE_IMAGE_API` when ready.
- The scoring for `/layouts/filter` is heuristic‑based; tune weights/ranges to taste.
