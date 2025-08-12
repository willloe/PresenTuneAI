## 0.1.0 — Week 1
- Add /v1/upload (streaming + parse); schema: ParsedPreview
- Add /v1/outline (stub slides with IDs)
- Add /v1/export (txt writer; path, bytes, theme)
- Add /v1/schema/{slide,deck}
- Add /v1/ops/retention/sweep
- Observability middleware (request id, server timing, structured perf/http logs)
- Frontend wired to health, upload, outline, export

## 0.2.0 — Week 2
- Add `POST /v1/outline/{index}/regenerate` (index-based single-slide regeneration)
- Image enrichment with stub provider (Picsum); optional Pexels provider
- Add `GET /v1/export/{filename}` for safe downloads
- UI: inline editing, per-slide regenerate, schema version chip, download button
- SDK: `src/sdk/` typed helpers (outline, regen, export)
- Observability: per-span telemetry + Server-Timing surfaced in UI
- Schema snapshots generated into `docs/schema/` (Deck/Slide), version `1.0`
