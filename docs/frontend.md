# Frontend

This file documents how the UI is wired and how to extend it. **New sections** add the media library, idempotent editor builds, improved Finalize flow, and Google Slides integration. Nothing from the earlier doc has been removed—only expanded.

---

## Phase flow (App.tsx)

The app guides users through five phases. State is kept locally with a few `useState` hooks and custom hooks for outline generation and local storage.

1. **Upload Extract** – `UploadSection` → `/v1/upload`
2. **Outline Generate** – `OutlineControls` → `/v1/outline`
3. **Edit & Assign** – `Preview` (list of `SlideCard`s`), **Add from Library** for images
4. **Layout Selection** – `LayoutSelectionList` + **Build Editor Doc**
5. **Finalize & Export** – `EditorPreview` + **Export** (with **Open in Google Slides**)

Important flags/state in `App.tsx`:

- `layouts` – fetched once via `api.layouts()`.
- `selection` – map of `slide_id → layout_id`.
- `editorResp` – result of `/v1/editor/build` containing an `EditorDoc`.
- `exportInfo` – result of `/v1/export` (path, bytes, format, `download_url`). **New: `download_url` is injected by the backend.**
- `uploadMeta.uploadId` – **New:** server‑generated ID (from `X-Upload-Id`) used to fetch asset thumbnails for the current upload.

Idempotency: we generate a persistent `idemKeyRef` per session and pass it as the `Idempotency-Key` header when building the editor to avoid duplicate work on repeated clicks.

---

## Upload & Extract (`UploadSection.tsx`)

- Accepts `.pdf`, `.docx`, `.txt`.
- Drag‑and‑drop bridges to the existing picker (`onPick`) via a synthetic change event.
- Shows filename, size, content type, preview text. **Pages and asset counts may be 0** depending on the extractor/provider.

**New:** The resulting `UploadResponse` now includes `uploadId` (from the `X-Upload-Id` response header). We retain it in `App` and pass it down to components that need to query `/v1/assets`.

---

## Media Library (assets)

**New:** Users can add images from the extracted asset set.

- `useAssets(uploadId)` → fetches `/v1/assets?upload_id=…` and returns `{ items, url(id) }`.  
  - `assetFileUrl(uploadId, assetId)` constructs `/v1/assets/{id}/file?upload_id=…` (served by FastAPI).  
  - Errors (e.g. corrupt `index.json`) are tolerated and surfaced as an empty list client‑side.
- `MediaLibraryDrawer` renders a grid of image thumbnails; clicking an item calls `onSelect(fileUrl)` and dismisses.

**Behavior choice:** Selecting **Add from Library** now **appends** an image to the slide instead of replacing the first one. Replacement remains available from the gallery editor (Replace action).

---

## Slide editing (`SlideCard.tsx`)

Each slide card lets you:

- **Edit title** (inline, Enter/Escape to save/cancel).
- **Edit blocks** via `BlocksEditor` (multi‑section text). We mirror the primary list into `slide.bullets` for compatibility.
- **Manage images** with **ImageGalleryEditor**:
  - Add via URL, Replace, Remove, Reorder (↑/↓), **AI Generate** (placeholder) and **Add from Library** (opens the drawer wired in `Preview`/`App`).
  - The first image is still surfaced as a large preview.
- **Reorder slides** (▲/▼).
- **Regenerate** a specific slide outline.

> Slide media are normalized to `{ type: "image", url, alt?, asset_id? }[]` inside the component to keep the editor predictable.

---

## Layout selection (`LayoutSelectionList.tsx`)

The picker accepts the full library and a `counts` hint (**`{ text_count, image_count }`**) for the current slide. It calls the backend filter to rank layouts and exposes three compact views:

- **Selected** – shows only the chosen layout. Click **Change…** to view recommendations.
- **Recommended** – top‑K ranked by `/layouts/filter`, with the selected item pinned first if present.
- **All** – everything, ordered by score/weight.

Props of note:

```ts
type LayoutSelectionListProps = {
  items: LayoutItem[];
  selection: Record<string, string>; // slide_id -> layout_id
  onSelect: (slideId: string, layoutId: string) => void;
};
```

Card thumbnails are rendered client‑side from layout `frames`. If you provide `preview_url` in a layout, you can swap the renderer to an `<img>` if desired.

---

## Visual preview (`EditorPreview.tsx`)

Renders the server‑built **EditorDoc** by placing each layer according to its `frame` (x/y/w/h in px on a 1280×720 canvas), honoring `z`‑order and `fit` for images (`cover`/`contain`/`fill`).

Props include grid layout controls (`cols`, `minColPx`, `maxThumbH`), frame outlines for debugging, and a minimum font size clamp for readability.

---

## Export & Finalize (`FinalizeSection.tsx`)

- The status bar shows whether the **Editor doc** is ready (slide count) and the **current theme**.
- **Export button** triggers `/v1/export` with either `{ editor }` or `{ slides }` (we prefer the former). While `exporting===true` the **Download** and **Open in Google Slides** actions are disabled.
- **Auto‑export**: when entering Step 5 with a built editor and no `lastExport`, we automatically run an export once. This reduces “why is Download 404?” confusion.
- **Last export** panel remembers the most recent successful export (`localStorage`) and provides:
  - **Download** – anchors to `exportInfo.download_url` (stable `/v1/export/{filename}`).
  - **Copy URL** – puts the same URL on the clipboard.
  - **Open in Google Slides** – see below.

### Google Slides integration

- `ensureGoogleDriveToken()` performs OAuth (scope `drive.file`). Configured by `GOOGLE_CLIENT_ID` in `/app-config.json` (frontend).  
- `openInGoogleSlides({ blob, name, artifactKey, getGoogleAccessToken })` uploads the exported PPTX to Google Drive and opens Slides for that file.
- We first fetch the PPTX **blob** from the server (`fetchExportBlob(download_url)`), then upload it with the token.
- Errors are surfaced to the user and don’t block subsequent downloads.

---

## API client (`src/lib/api.ts`)

A tiny typed wrapper around `fetch`. Key helpers used by the UI:

- `api.layouts()` – `GET /v1/layouts`
- `api.filterLayouts({ components, top_k })` – `POST /v1/layouts/filter`
- `api.buildEditor({ deck, selections, theme, policy }, { idempotencyKey })` – `POST /v1/editor/build`
- `api.exportDeck({ slides? editor?, theme, theme_meta? })` – `POST /v1/export`

All functions return `{ data, ok, status }` style objects.

---

## Styling & Accessibility

- Components use Tailwind utility classes; cards/buttons have clear focus styles.
- Keyboard: Enter/Escape in editors, and buttons include `aria-label`s for reorder controls.
- Thumbnails scale responsively using CSS `aspect-ratio` and grid `minmax` columns.

---

## Extending the UI

- **Add new layouts** – add to `app/static/layouts/layouts.json`. The picker will order them via the backend filter; tune `supports` and `weight` to influence ranking.
- **More layer kinds** – extend `EditorPreview` and the backend exporter simultaneously (e.g., shapes/tables/charts). Everything is framed in absolute coordinates, so preview → export stays consistent.
- **Real image generation** – wire `onAIGenerate` to your provider and store assets in your media store; continue returning a resolvable `url` to the frontend.

---

## Troubleshooting

- **I don’t see Server‑Timing in DevTools.** Ensure `TIMING_ALLOW_ORIGIN` in `.env` includes your frontend origin (or `*` in local dev).
- **Layouts list shows only a few items.** Confirm `app/static/layouts/layouts.json` is present and valid. Use `GET /v1/layouts?reload=true` after edits.
- **Export yields a `.txt`.** That’s the fallback when python‑pptx is unavailable. Install build deps or use the Dockerfile.
- **Add from Library replaced my image.** By design in `SlideCard` we **append** from the library; use Replace in the gallery to swap the first image.

