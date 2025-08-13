## 0.1.0 — Week 1
- Add /v1/upload (streaming + parse); schema: ParsedPreview
- Add /v1/outline (stub slides with IDs)
- Add /v1/export (txt writer; path, bytes, theme)
- Add /v1/schema/{slide,deck}
- Add /v1/ops/retention/sweep
- Observability middleware (request id, server timing, structured perf/http logs)
- Frontend wired to health, upload, outline, export

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