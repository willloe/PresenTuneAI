## 0.1.0 — Week 1
- Add /v1/upload (streaming + parse); schema: ParsedPreview
- Add /v1/outline (stub slides with IDs)
- Add /v1/export (txt writer; path, bytes, theme)
- Add /v1/schema/{slide,deck}
- Add /v1/ops/retention/sweep
- Observability middleware (request id, server timing, structured perf/http logs)
- Frontend wired to health, upload, outline, export
