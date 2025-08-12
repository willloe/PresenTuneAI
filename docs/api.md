# PresenTuneAI API – Week 1

Schema version: **1.0**  
Status: **stub generator** (outline is placeholder; export coming in Week 3)

---

## Base URLs

- **Local (Docker/dev)**: `http://localhost:8000/v1`
- **Staging (Render)**: `https://<your-render>.onrender.com/v1`

In the frontend, the base is configured via `VITE_API_BASE`.

---

## Conventions & Headers

- All responses are JSON and include:
  - `x-request-id`: per-request correlation id
  - `x-response-time-ms`: total server time for the request (milliseconds)
  - `Server-Timing: app;dur=...` (visible in browser DevTools)

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
{ "status": "ok" }
```

**Response headers**
```
x-request-id: <hex>
x-response-time-ms: <int>
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
  "file_id": "abc123",
  "filename": "doc.pdf",
  "size": 4096,
  "content_type": "application/pdf",
  "parsed": {
    "kind": "pdf",
    "pages": 2,
    "text_preview": "First 1–2KB of text...",
    "text": "full plain text (dev mode only)"
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

### 3) Outline (stub Deck)

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
      "media": []
    }
  ]
}
```

- Titles are derived from de-noised text lines (bullet glyphs, numbering, and common PDF artifacts are stripped; long lines are ellipsized).
- `slide_count` is kept in sync with `slides.length` by the server.
- `id` is a client-editable identifier (UUIDv4 hex generated server-side).

**Curl**
```bash
curl -s http://localhost:8000/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}'
```

---

### 4) JSON Schemas (live)

- `GET /schema/slide` → JSON Schema for **Slide**
- `GET /schema/deck`  → JSON Schema for **Deck**

These are generated from server models and will always match the API.

**Curl**
```bash
curl http://localhost:8000/v1/schema/deck | jq .title
curl http://localhost:8000/v1/schema/slide | jq .title
```

---

### 5) Ops (optional, dev)

`POST /ops/retention/sweep` → Deletes expired files from local storage.  
TTL and sweep interval are configured via environment variables.

**Response**
```json
{ "deleted": [".../old1.pdf"], "count": 1 }
```

---

## CORS

- Local dev: set `ALLOW_ALL_CORS=true` **or** specify
  `CORS_ALLOW_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`.
- Staging: add your Vercel origin to allowed origins.

---

## Versioning Policy

- The Deck/Slide contract is versioned via `version` (e.g., `"1.0"`).
- Backward-incompatible changes will bump the version.
- Static JSON Schemas are stored in `docs/schema/` for auditing; live schemas are served at `/schema/*`.

---

## Quick Smoke Tests

Local:
```bash
# health
curl -i http://localhost:8000/v1/health

# outline
curl -s http://localhost:8000/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.version,.slides|length'

# schemas
curl -s http://localhost:8000/v1/schema/deck  | jq '.title'
curl -s http://localhost:8000/v1/schema/slide | jq '.title'
```

Staging:
```bash
curl -i https://<render>.onrender.com/v1/health
curl -s https://<render>.onrender.com/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.slide_count'
```
