# Frontend
## Flows
1) **Upload** (PDF/DOCX/TXT) → preview filename/size/kind/pages and text preview
2) **Outline** → uses topic or uploaded `parsed.text`
3) **Edit** → inline title/bullets editing (client-side state)
4) **Per‑slide regenerate** → calls `POST /outline/{index}/regenerate` and replaces that slide only
5) **Image enrichment** → renders image from provider; optional “Refresh image” (client-only)
6) **Export + Download** → `POST /export`, then `GET /export/{filename}` via a “Download” link

## Components
- `HeaderBar` – shows API health and **schema v1.0** chip
- `UploadSection` – file input + parsed preview
- `OutlineControls` – topic input, generate/export, error/meta display, download link
- `Preview` – list of slides, edit and per‑slide regenerate, shows image if available
- `Settings` – theme, default slide count, toggle images, API base

## Hooks
- `useOutline()` → `{ deck, loading, error, meta, generate, regenerate, updateSlide, clearError }`

## SDK
- `src/sdk/` re-exports typed helpers: `outline`, `outlineWithMeta`, `regenerateSlide`, `exportDeck`, etc.

## Utilities
- `exportDownloadUrl(path)` builds `/export/{filename}` link from server path
- `useLocalStorage(key, default)` for sticky UI prefs

## Dev headers
- UI surfaces `Server-Timing` and `X-Request-Id` to help trace issues quickly.

## Config:
- `VITE_API_BASE`: dev => `http://localhost:8000/v1`; prod => `/v1`

## Developer notes:
- `api.ts` surfaces `x-request-id` and `server-timing` for easy debugging
- UI shows request id next to errors and preview header
