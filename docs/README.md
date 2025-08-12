# PresenTuneAI — Week 1 Checkpoint

This checkpoint includes:
- Upload → Parse (PDF/DOCX/TXT) → Outline stub → Export (txt)
- Observability middleware (request id, server timing, structured logs)
- Frontend demo (upload + outline + export)

## Quick start
```bash
docker compose up -d --build
# API at http://localhost:8000, UI at http://localhost:5173 (or your setup)
```

## Useful URLs
- OpenAPI JSON: `/openapi.json`
- Swagger UI: `/docs`
- Health: `GET /v1/health`

# PresenTuneAI — Week 2 Checkpoint

**Date:** 2025-08-12 20:34 UTC  
**Schema version:** `1.0`

This week delivers a polished demo loop:
- Upload → Parse → **Outline** (placeholder/agent-ready) → **Per-slide Regenerate** → **Image enrichment** (stub or Pexels) → **Export + Download**.
- Frontend shows **schema version** and **Server‑Timing**/**Request‑Id** for easy debugging.
- A tiny **typed SDK** wraps the API for future consumers.
- **Schema snapshots** are frozen in `docs/schema/`.

## What’s new in Week 2
- `POST /v1/outline/{index}/regenerate` – regenerate a single slide (index‑based).
- Image enrichment via configurable provider (`stub` default; optional `pexels`).
- `GET /v1/export/{filename}` – safe file download for exported artifacts.
- UI: editable outline, per‑slide regenerate, “Download” button, header chip with schema version.
- Telemetry: spans surfaced via `Server‑Timing` header; request correlation with `X‑Request‑Id`.
- Schema snapshots generated under `docs/schema` (Deck/Slide).

## Quick start
```bash
docker compose up -d --build
# API at http://localhost:8000/v1, UI at http://localhost:5173
```
