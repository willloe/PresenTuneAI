# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2025-08-19
### Added
- **Layout library is JSON-backed** with hot reload via `GET /layouts?reload=true`; loader normalizes `supports` and `frames` (coalesces `img0..N` → `images[]`, coerces single `bullets` → list).
- **Layout recommendations** endpoint `POST /layouts/filter` returns ranked `candidates` by component counts.
- **Editor build** endpoint `POST /editor/build` (with optional `Idempotency-Key`) produces an `EditorDoc` from a `Deck`, supports multiple images per slide (zipped with layout frames), returns warnings on best‑fit substitution.
- **Exact-position PPTX export**: `POST /export` now accepts an `EditorDoc` for pixel‑faithful export (text styling, image fit cover/contain/fill, background color, slide size = editor page).
- **Frontend primitives (documented)**: client-side layout thumbnails from `frames`, Layout Picker modes (Selected / Recommended / All), EditorPreview.

### Changed
- `/export` simplified to a single entrypoint that accepts `{ "slides": … }` **or** `{ "editor": … }`. `.txt` fallback retained when `python-pptx` is unavailable.
- Static files are mounted at `/static`; missing `layouts.json` falls back to 3 default layouts.

### Fixed
- Export image type detection and temp file handling are more robust; object‑fit math matches browser previews closely.
- Safer filename resolution for `/export/{filename}` downloads (prevents path traversal).

---

## [0.3.1] - 2025-08-19
### Added
- **Docs consolidation**: API/Config/Deploy updated to reflect Layout Library (`/layouts` + normalization), Layout Filtering, Editor Build (idempotent), and Export (editor-aware).
- **Frontend UX**: Layout Picker modes (Selected / Recommended / All), mini-previews scaled by page aspect; selected-first and bring-to-front behavior.
### Changed
- Clarified static assets mount and fallback behavior when `layouts.json` is missing (server ships defaults).
- Documented idempotency cache TTL (300s) and `GET /layouts?reload=true` to refresh in-memory cache.
### Fixed
- A few typos and missing curl examples across docs.

---

## [0.3.0] - 2025-08-18
### Added
- **Layout library**: `GET /layouts` (with `reload`), reads `app/static/layouts/layouts.json`, normalizes `supports` and `frames` (merges `img0..*` into `images[]`, coerces single `bullets` into list), optional `preview_url`.
- **Layout recommendations**: `POST /layouts/filter` with `{components:{text_count,image_count},top_k}`; distance/weight heuristic used server-side (mirrored in the frontend for resilience).
- **Editor build**: `POST /editor/build` → returns **EditorDoc** with absolute frames/layers (`textbox`/`image`), supports multiple images per slide. `policy="best_fit"` (with warnings) or `"strict"` (400). **Idempotency-Key** header with 5-minute cache.
- **Export (editor-aware)**: `/export` now accepts either `{slides,…}` or `{editor,…}`; PPTX writer maps frames to shapes and performs px→EMU conversion; object-fit `"cover"` used for images by default.
- **Static /static mount**: serve `layouts.json` and preview PNGs from `app/static/layouts/`.

### Improved
- Safer defaults and better error messages in build/export; warnings surfaced in editor build response.
- Frontend UX: Layout Picker modes (Selected / Recommended / All), responsive card grid and mini-previews derived from `frames`.

### Fixed
- Eliminated circular import by exposing `get_layout_library()` and calling it from the editor endpoint.

### Notes
- **Schema**: Deck/Slide remain **1.0**. EditorDoc and Layouts are additive contracts (no breaking changes to existing clients).

---

## [0.2.0] - 2025-08-12
### Added
- Inline slide editor (titles/bullets) with save on blur/Enter/Ctrl+S and a11y.
- Per-slide regenerate + image preview (stub/pexels provider; feature-flagged).
- “Download export” button (uses `/export/{filename}`).
- Server-Timing surfaced to UI; Observability middleware exposes headers.
- JSON Schema endpoints for Slide/Deck/OutlineRequest/Upload.
- PowerShell/Unix smoke tests; retention worker moved to `workers/retention.py`.
### Fixed/Improved
- Safer export download route (whitelist pattern + content-type).
- Better API client metadata (x-request-id, server-timing).

## 0.1.0 — Week 1
- Add /v1/upload (streaming + parse); schema: ParsedPreview
- Add /v1/outline (stub slides with IDs)
- Add /v1/export (txt writer; path, bytes, theme)
- Add /v1/schema/{slide,deck}
- Add /v1/ops/retention/sweep
- Observability middleware (request id, server timing, structured perf/http logs)
- Frontend wired to health, upload, outline, export
