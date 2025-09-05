# PresenTuneAI API

Schema version: **1.0** (Deck/Slide)  
Status: **upload → outline → per‑slide regenerate → media library → layout filter → editor build → export & download (Google Slides ready)**

---

## Base URLs

- **Local (Docker/dev)**: `http://localhost:8000/v1`
- **Staging (Render/other)**: `https://<your-app>/v1`

The frontend reads the API base from `VITE_API_BASE` at build time.

---

## Conventions & Headers

- All responses are JSON and include (via Observability middleware):
  - `X-Request-Id`: per-request correlation id
  - `X-Response-Time-Ms`: total server time (ms)
  - `Server-Timing`: semicolon-delimited spans (visible in browser DevTools)
- Errors use a uniform envelope (see **Errors**):
  ```json
  { "detail": "message", "request_id": "…" }
  ```
- **Idempotency** (recommended for `POST /editor/build`): send `Idempotency-Key: <token>` to safely retry; 5‑minute cache window.
- **Auth**: When `AUTH_ENABLED=true` the API requires a bearer token (`Authorization: Bearer …`) for state-changing routes; otherwise open for local dev.
- **CORS**: Controlled by `ALLOW_ALL_CORS` (dev default) and `CORS_ALLOW_ORIGINS` list.

---

## Storage model (important)

- `settings.STORAGE_DIR` is the **uploads root** (Docker default: `/app/data/uploads`). Your `docker-compose.yml` should bind‑mount this path.
- **Exports** are normalized into a sibling directory: `/app/data/exports`. Bind‑mount it too if you want artifacts on the host.
- Each upload gets a folder: `/app/data/uploads/{uploadId}/`. Extracted assets live under `/app/data/uploads/{uploadId}/assets` with an `index.json` manifest.
- A retention worker may periodically sweep old files (see **Ops**).

> Tip: we expose a tiny debug endpoint `GET /export/_debug/list` in dev to list where exports are found on disk.

---

## Endpoints

### 1) Health

`GET /health` → `200 OK`

**Response**
```json
{ "status": "ok", "schema_version": "1.0", "time": "2025-08-12T15:04:05Z" }
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
  "path": "/abs/path/doc.pdf",
  "parsed": {
    "kind": "pdf",
    "pages": 2,
    "text": "full plain text (dev mode)",
    "text_length": 12345,
    "text_preview": "First ~1KB…",
    "assets": [ /* optional, when available */ ]
  }
}
```
**Headers**
- `X-Upload-Id`: **uploadId** used by the Media Library endpoints.

Notes:
- In **local dev**, `parsed.text` is returned to help the outline stub; in staging/prod you may restrict to `text_preview` only.
- The frontend merges the `X-Upload-Id` header into the JSON so components can call `/assets?upload_id=…`.

**Curl**
```bash
curl -i -F "file=@/path/to/file.pdf" http://localhost:8000/v1/upload
```

---

### 3) Outline (Deck placeholder)

`POST /outline`

Generates a placeholder **Deck** from topic and/or uploaded text.

**Request**
```json
{ "topic": "AI Hackathon", "text": "optional raw text", "slide_count": 5 }
```

**Constraints & behavior**
- `slide_count` clamped **1..15**.
- If `text` provided, titles are derived from cleaned lines; otherwise defaults (“Overview”, “Goals”, …).
- Server ensures `slide_count === slides.length`.
- Each slide has a stable `id` and optional `media[]` (images).

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
      "title": "Slide 1: …",
      "bullets": ["placeholder bullet"],
      "notes": null,
      "layout": "auto",
      "media": [
        { "type": "image", "url": "https://…/seed/…/800/500", "alt": "…" }
      ]
    }
  ]
}
```

**Curl**
```bash
curl -s http://localhost:8000/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}'
```

---

### 4) Regenerate a single slide (index-based)

`POST /outline/{index}/regenerate` (0-based `index`)

**Request** (same shape as `/outline`)
```json
{ "topic": "Demo", "text": null, "slide_count": 5 }
```

**Behavior**
- Only regenerates the slide at `index`.
- Response is a **Slide**; client replaces the item in place.

**Curl**
```bash
curl -s http://localhost:8000/v1/outline/2/regenerate   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":5}'
```

---

### 5) Layouts (library + filtering)

These endpoints power the layout picker and the editor build.

#### 5a) List layouts

`GET /layouts?reload=false`

Loads the in-memory **LayoutLibrary** (from `app/static/layouts/layouts.json` if present; otherwise built-in defaults). Pass `reload=true` to re-read from disk.

**Response (200) – LayoutLibrary**
```json
{
  "items": [
    {
      "id": "title_bullets_left",
      "name": "Title + Bullets (Left)",
      "supports": { "text_min": 1, "text_max": 12, "images_min": 0, "images_max": 1 },
      "weight": 0.95,
      "preview_url": "/static/layouts/title_bullets_left.png",
      "frames": {
        "title":   { "x": 80, "y": 64,  "w": 1120, "h": 80 },
        "bullets": [{ "x": 80, "y": 170, "w": 720,  "h": 360 }],
        "images":  [{ "x": 840, "y": 200, "w": 360,  "h": 240 }]
      },
      "style": { "title": { "font": "Inter", "size": 36, "weight": 700 } }
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 3
}
```

**JSON normalization the server performs (so your `layouts.json` can be flexible):**
- `supports`: accepts either `{text_min/max, images_min/max}` **or** `{text_count, image_count}`; the latter is expanded to ranges.
- `frames`: accepts image frames as `img0`, `img1`, …; they are merged into `frames.images[]`.
- `frames.bullets` can be a single object or a list; coerced to a list.
- `preview_url` is optional; if present it’s served from `/static`. If absent, the frontend renders a miniature from `frames`.

#### 5b) Filter layouts (recommendations)

`POST /layouts/filter`

**Request**
```json
{ "components": { "text_count": 3, "image_count": 1 }, "top_k": 6 }
```

**Response**
```json
{ "candidates": ["title_bullets_left", "title_image_right", "two_col_text_image"] }
```

**Scoring (server heuristic)**  
We compute a distance score using penalties for being outside the supported ranges plus a closeness term if inside range; lower is better. Weight boosts preferred templates. (The frontend mirrors this logic offline for resilience.)

---

### 6) Editor — build an EditorDoc from a Deck + selections

`POST /editor/build`

Builds an **EditorDoc** (absolute frames on a page) by applying a chosen layout per slide. Use `Idempotency-Key` for safe retries; responses are cached for 5 minutes per key.

**Request**
```json
{
  "deck": { /* Deck schema v1.0 with slides/media */ },
  "selections": [
    { "slide_id": "s1", "layout_id": "title_bullets_left" },
    { "slide_id": "s2", "layout_id": "title_image_right" }
  ],
  "theme": "default",
  "page": { "width": 1280, "height": 720, "unit": "px" },
  "policy": "best_fit",
  "warnings_as_errors": false
}
```

**Behavior**
- Unknown `layout_id`:
  - `policy="best_fit"` → substitute best weighted layout and emit a warning.
  - `policy="strict"` → `400` with details.
- Media: tolerates v1.0 and extended fields (`source`, `asset_id`). Multiple images are placed into `frames.images[]` order; extras are ignored with a warning (best_fit) or error (strict).
- Layers generated per slide (examples):
  - **textbox** for `title` and first `bullets` frame.
  - **image** for each mapped image frame with `fit="cover"` by default.

**Response (200)**
```json
{
  "editor": {
    "editor_id": "ed_cafe1234abcd",
    "deck_id": "dk_beefcafe",
    "page": { "width": 1280, "height": 720, "unit": "px" },
    "theme": "default",
    "slides": [
      {
        "id": "s1",
        "name": "Overview",
        "layers": [
          { "id": "ly_s1_title",   "kind": "textbox",
            "frame": { "x":80,"y":64,"w":1120,"h":80 },
            "text": "Overview",
            "style": { "font":"Inter","size":36,"weight":700,"align":"left" },
            "z": 10
          },
          { "id": "ly_s1_bullets","kind": "textbox",
            "frame": { "x":80,"y":170,"w":720,"h":360 },
            "text": "- point A\n- point B",
            "style": { "font":"Inter","size":20 },
            "z": 9
          },
          { "id": "ly_s1_img0",   "kind": "image",
            "frame": { "x":840,"y":200,"w":360,"h":240 },
            "source": { "type":"external","url":"https://…" },
            "fit": "cover",
            "z": 6
          }
        ],
        "meta": { "layout_id": "title_bullets_left" }
      }
    ],
    "meta": { "created_at": "2025-08-18T00:00:00Z" }
  },
  "warnings": [
    { "slide_id":"s2","reason":"unknown_layout_best_fit_substitution","layout_id":"title_bullets_left" }
  ],
  "meta": { "idempotency": "HIT or MISS" }
}
```

---

### 7) Assets / Media Library

These power the “Add from Library” drawer in the frontend.

`GET /assets?upload_id=<id>` → list assets for an upload  
`GET /assets/{asset_id}?upload_id=<id>` → single asset metadata  
`GET /assets/{asset_id}/file?upload_id=<id>` → file bytes (with guessed MIME)

**Asset model (minimal, additive)**  
```json
{
  "id": "29d9ce08-…",
  "filename": "image1.png",
  "ext": ".png",
  "rel_path": "app/data/uploads/<id>/assets/image1.png",
  "bytes": 123456,
  "width": 1280,
  "height": 720,
  "created_at": "2025-08-12T12:00:00Z"
}
```

**Notes**
- The store reads `/uploads/{id}/assets/index.json`. It tolerates:
  - Missing file → `[]`
  - Either `{items:[…]}` or a bare `[…]`
  - **Corrupt JSON** → returns `[]` (prevents `500`).
- Writes are **atomic** (`.tmp` + `os.replace`).
- File responses 410 when the index exists but the underlying file is gone.

---

### 8) Export + Download

**Export (create artifact)**  
`POST /export`

Two request modes are supported:

1) **Deck-only** (legacy)
```json
{ "slides": [ /* Slide[] from your edited deck */ ], "theme": "default" }
```

2) **Editor-aware** (preferred once you’ve built the editor doc)
```json
{ "editor": { /* EditorDoc from /editor/build */ }, "theme": "default" }
```

- If `editor` is present, the exporter places text boxes and images at exact frames (16:9 page, px → EMU conversion).
- If only `slides` are provided, exporter creates a simple PPTX or text stub (depending on build flavor). The simple PPTX supports **multiple images** (2–6) using an auto grid layout when the layout library is not involved.

**Response (200)**
```json
{
  "path": "/abs/path/deck_YYYYMMDD_HHMMSS_default.pptx",
  "format": "pptx",
  "theme": "default",
  "bytes": 2048,
  "download_url": "http://localhost:8000/v1/export/deck_YYYYMMDD_HHMMSS_default.pptx"
}
```

**Download (serve artifact)**  
`GET /export/{filename}`

- Filenames must match `^[A-Za-z0-9._-]+\.(txt|pptx)$`.  
- The server **locates by filename** across several known roots and normalizes into `/app/data/exports` to provide a stable URL.  
- **Dev helper**: `GET /export/_debug/list` enumerates candidate roots (disabled in prod deployments).

---

### 9) JSON Schemas (live)

- `GET /schema/slide` → JSON Schema for **Slide**
- `GET /schema/deck` → JSON Schema for **Deck**

Static snapshots live in `docs/schema/`.

---

### 10) Ops (optional, dev)

`POST /ops/retention/sweep` → Deletes expired files from local storage.

---

## Static assets

- The API serves `/static/**`. Place `app/static/layouts/layouts.json` and any preview PNGs there.
- On start, the Layout Library is loaded once; `GET /layouts?reload=true` refreshes the in-memory cache.

---

## Versioning Policy

- Deck/Slide remain **1.0**.
- Layout and EditorDoc contracts are additive; when breaking, we’ll bump Deck/Slide and document an EditorDoc version.

---

## Client Integration Notes

- The Finalize step in the frontend **auto-runs export** on mount when an EditorDoc is present; buttons are disabled while `exporting=true` and re-enabled when the artifact is ready.
- “Open in Google Slides” uploads the `.pptx` to Drive (scope `drive.file`) and opens it; requires a configured `GOOGLE_CLIENT_ID` and OAuth token acquisition on the client.

---

## Errors

All errors are JSON with a consistent envelope:
```json
{ "detail": "...", "request_id": "..." }
```
- `400` unknown layout (strict), invalid parameters
- `404` export file not found, asset missing
- `410` asset file missing (known in index)
- `422` validation errors (Pydantic list under `detail`)
- `500` unhandled exceptions (see logs; correlate via `X-Request-Id`)

---

## Quick Smoke Tests

```bash
# health
curl -i http://localhost:8000/v1/health

# outline
curl -s http://localhost:8000/v1/outline -H "Content-Type: application/json"   -d '{"topic":"Test","slide_count":3}' | jq '.version,.slides|length'

# layouts + filter
curl -s http://localhost:8000/v1/layouts | jq '.total,.items[0].id'
curl -s http://localhost:8000/v1/layouts/filter -H "Content-Type: application/json"   -d '{"components":{"text_count":3,"image_count":1},"top_k":6}'

# editor build (with idempotency)
curl -s http://localhost:8000/v1/editor/build   -H "Content-Type: application/json"   -H "Idempotency-Key: demo123"   -d @editor_build_payload.json | jq '.editor.slides|length,.warnings|length'

# export (editor-aware)
curl -s http://localhost:8000/v1/export -H "Content-Type: application/json"   -d '{"editor":{ /* from /editor/build */ }, "theme":"default"}' | tee export.json

NAME=$(jq -r .path export.json | awk -F'/' '{print $NF}')
curl -I http://localhost:8000/v1/export/$NAME

# assets (replace UPID)
curl -s 'http://localhost:8000/v1/assets?upload_id=UPID' | jq '.count,.items[0].filename'
```

---

## Addendum: Text Sections & Editor Build (pre‑migration)

> This addendum documents the client→server contract we implemented for the new
> **text sections** while the backend still accepts legacy slide fields.
> It **adds** details and does **not** remove any prior content in this file.

### New canonical text model (client-side)

```ts
type TextSection =
  | { id?: string; kind: "paragraph"; text: string; role?: "primary" | "secondary" | null }
  | { id?: string; kind: "list"; bullets: string[]; role?: "primary" | "secondary" | null };
```

- A slide carries sections under `slide.meta.sections`.
- The editor keeps legacy `slide.bullets` mirrored from the **primary** list for back‑compat.
- Validation on submit: drop empty paragraphs, trim list items, clamp lists to 12 entries.

### Layout mapping (server build semantics)

- Title box uses `slide.title`.
- Remaining text slots are filled from `meta.sections` in this order:
  1. First `list` with `role:"primary"` (or the first `list`).
  2. Remaining `paragraph`/`list` sections in document order.
- Excess sections are truncated; missing sections produce muted placeholders.
- Image slots are populated from `slide.media` in order.

### Build endpoint (recap)

`POST /editor/build` accepts a full `Deck`, optional per‑slide `selections` of `layout_id`,
a `theme`, and optional `theme_meta`. It responds with an **EditorDoc** that the export step
renders 1:1 (same geometry used by the Workbench preview).

- Provide an `Idempotency-Key` header for safety.
- The `policy: "best_fit"` parameter chooses a layout when one isn’t selected.
- Warnings are returned when content doesn’t fit the chosen layout.

### Compatibility

- Legacy flows (`title`, `bullets`, single `media[0]`) remain valid.
- New sections are **additive**; they become the authoritative source once the full migration lands.
