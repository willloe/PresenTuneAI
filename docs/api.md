# PresenTuneAI API

Schema version: **1.0**  
Status: **placeholder outline + per-slide regenerate + image enrichment + export & download**

---

## Base URLs

- **Local (Docker/dev)**: `http://localhost:8000/v1`
- **Staging (Render)**: `https://<your-render>.onrender.com/v1`

In the frontend, the base is configured via `VITE_API_BASE`.

---

## Conventions & Headers

- All responses are JSON and include:
  - `x-request-id`: per-request correlation id
  - `x-response-time-ms`: total server time (ms)
  - `Server-Timing`: comma-separated spans (visible in browser DevTools). Includes a final `app;dur=…` aggregate.
- Error shape:
```json
{ "detail": "message" }
```

---

## Endpoints

### 1) Health

`GET /health` → `200 OK`

**Response**
```json
{ "status": "ok", "schema_version": "1.0", "time": "2025-08-12T15:04:05Z" }
```

**Response headers**
```
x-request-id: <hex>
x-response-time-ms: <int>
server-timing: outline_stub_build;dur=12, app;dur=34
```

**Curl**
```bash
curl -i http://localhost:8000/v1/health
```

---

### 2) Upload

`POST /upload` (multipart/form-data)  
Form field: **file** (pdf/docx/txt)

**Response (200)**
```json
{
  "filename": "doc.pdf",
  "size": 4096,
  "content_type": "application/pdf",
  "path": "/abs/path/doc.pdf",   // null in non-debug
  "parsed": {
    "kind": "pdf",
    "pages": 2,
    "text": "full plain text (dev mode)",
    "text_length": 12345,
    "text_preview": "First ~1KB…"
  }
}
```

**Curl**
```bash
curl -F "file=@/path/to/file.pdf" http://localhost:8000/v1/upload
```

Notes:
- In **local dev**, `parsed.text` is returned to help the outline stub.
- In staging/production, you may restrict to `text_preview` only.

---

### 3) Outline (Deck placeholder)

`POST /outline`

Generates a placeholder **Deck** from topic and/or uploaded text.

**Request**
```json
{
  "topic": "AI Hackathon",
  "text": "optional: extracted text from upload",
  "slide_count": 5
}
```

**Constraints & behavior**
- `slide_count` is clamped **1..15**.
- If `text` is provided, titles are derived from de-noised lines (bullet glyphs, numbering, common PDF artifacts stripped; long lines ellipsized).  
- If **no text**, slide titles use sensible default headings based on the topic (e.g., “Overview”, “Goals”, …).
- The server ensures `slide_count === slides.length`.

**Response (200) – Deck (schema v1.0)**
```json
{
  "version": "1.0",
  "topic": "AI Hackathon",
  "source": null,
  "slide_count": 5,
  "created_at": "2025-08-11T20:12:00Z",
  "slides": [
    {
      "id": "f7b7f2...",
      "title": "Slide 1: Cleaned first line from text…",
      "bullets": ["placeholder bullet"],
      "notes": null,
      "layout": "title-bullets",
      "media": [
        { "type": "image", "url": "https://…/seed/…/800/500", "alt": "Cleaned first line from text…" }
      ]
    }
  ]
}
```

**Curl**
```bash
curl -s http://localhost:8000/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}'
```

**Errors**
- `400` — `Provide either 'text' or 'topic'`

---

### 4) Regenerate a single slide (index-based)

`POST /outline/{index}/regenerate` (0-based `index`)

**Request** (same shape as `/outline`)
```json
{ "topic": "Demo", "text": null, "slide_count": 5 }
```

**Behavior**
- Regenerates **only** the slide at `index`.
- Index must be within `0..(slide_count-1)`.
- Response is a **Slide**; client replaces the item in-place.

**Response (200) – Slide**
```json
{
  "id": "a1b2c3...",
  "title": "Slide 3: Demo — Risks & Mitigations",
  "bullets": ["placeholder bullet"],
  "notes": null,
  "layout": "title-bullets",
  "media": [{ "type": "image", "url": "https://…", "alt": "Demo — Risks & Mitigations" }]
}
```

**Curl**
```bash
curl -s http://localhost:8000/v1/outline/2/regenerate   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":5}'
```

**Errors**
- `400` — `Provide either 'text' or 'topic'`
- `400` — `index {n} out of range for slide_count={m}`

---

### 5) Export + Download

**Export (create artifact)**  
`POST /export`

**Request**
```json
{
  "slides": [ /* Slide[] from your edited deck */ ],
  "theme": "default"
}
```

**Response (200)**
```json
{
  "path": "/abs/path/deck_YYYYMMDD_HHMMSS_default.txt",
  "format": "txt",
  "theme": "default",
  "bytes": 2048
}
```

**Curl**
```bash
curl -s http://localhost:8000/v1/export   -H "Content-Type: application/json"   -d @payload.json
```

**Download (serve artifact)**  
`GET /export/{filename}`

- Only filenames matching `^deck_\d{8}_\d{6}_[A-Za-z0-9_-]+\.(txt|pptx)$` are allowed.
- Responds with appropriate `Content-Type` and download disposition.

**Curl**
```bash
# After POST /export, extract the filename and download:
NAME="deck_20250812_120201_default.txt"
curl -I http://localhost:8000/v1/export/$NAME
curl -o out.txt http://localhost:8000/v1/export/$NAME
```

**Errors**
- `404` — `not found` (unknown filename)

---

### 6) JSON Schemas (live)

- `GET /schema/slide` → JSON Schema for **Slide**
- `GET /schema/deck`  → JSON Schema for **Deck**

Static snapshots live in `docs/schema/`.

**Curl**
```bash
curl http://localhost:8000/v1/schema/deck  | jq .title
curl http://localhost:8000/v1/schema/slide | jq .title
```

---

### 7) Ops (optional, dev)

`POST /ops/retention/sweep` → Deletes expired files from local storage.  
TTL and sweep interval configured via environment variables.

**Response**
```json
{ "deleted": [".../old1.pdf"], "count": 1 }
```

---

## Feature flags & behavior

- `FEATURE_USE_MODEL=true` → use **Agent** strategy (via `AGENT_URL`) for outline and regen; otherwise use placeholder strategy.
- `FEATURE_IMAGE_API=true` → attach image `media` to slides.  
  - `IMAGE_PROVIDER=stub` (default) → deterministic Picsum URL.  
  - `IMAGE_PROVIDER=pexels` → requires `PEXELS_API_KEY`; fetches a relevant stock image.

---

## CORS

- Local dev: set `CORS_ALLOW_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`.
- Staging: add your Vercel/Render origin to allowed origins.

---

## Versioning Policy

- The Deck/Slide contract is versioned via `version` (e.g., `"1.0"`), and echoed as `schema_version` in `/health`.
- Backward-incompatible changes will bump the version.
- Static JSON Schemas are stored in `docs/schema/`; live schemas are served at `/schema/*`.

---

## Quick Smoke Tests

Local:
```bash
# health
curl -i http://localhost:8000/v1/health

# outline
curl -s http://localhost:8000/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.version,.slides|length'

# regen (index=1)
curl -s http://localhost:8000/v1/outline/1/regenerate   -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.title'

# export + download
curl -s http://localhost:8000/v1/export   -H "Content-Type: application/json"   -d '{"slides":[/* from outline */], "theme":"default"}' | tee export.json
NAME=$(jq -r .path export.json | awk -F'[\/]' '{print $NF}')
curl -I http://localhost:8000/v1/export/$NAME

# schemas
curl -s http://localhost:8000/v1/schema/deck  | jq '.title'
curl -s http://localhost:8000/v1/schema/slide | jq '.title'
```

Staging:
```bash
curl -i https://<render>.onrender.com/v1/health
curl -s https://<render>.onrender.com/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.slide_count'
```
