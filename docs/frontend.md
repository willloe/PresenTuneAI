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

---
## 2025-09 Editor Workbench refresh (frontend only)

This release keeps the backend API unchanged but modernizes the **Editor Workbench** and related preview/authoring flows. The goal was to reuse as many battle‑tested components as possible while tightening the boundaries between **editing**, **layout selection**, and **final preview**.

### What changed

- **Tabbed workbench**: `EditorWorkbench` now surfaces three tabs per slide — **Content**, **Layout**, and **Media** — but delegates the heavy lifting to focused panels/components.
- **Text authoring uses the canonical TextSection model**:
  - We reuse the legacy `BlocksEditor` component (paragraphs & bullet lists) but treat it as a *pure* editor that edits an array of `TextSection` objects.
  - On **Save**, sections are sanitized and bridged onto the slide via `applySectionsToSlide` (adds/updates `slide.meta.sections`, mirrors the primary list into `slide.bullets` for back‑compat, and leaves `title` alone).
  - Empty paragraphs are dropped and bullet lists are normalized (`normalizeBulletsInput`), avoiding the backend `422` on empty text.
- **Live “final look” preview**:
  - The right pane renders *exactly* what the export will contain. We reuse `LayerView` and theme defaults from `themeKeyToMeta` to render `EditorDocOut.slides[n].layers`.
  - `ActiveSlideStage` scales the slide into the available width and sets `position: relative` so `LayerView`’s absolutely‑positioned children land in the right place.
  - Layers are sorted by `z` and images are rendered through `SafeImage` (with graceful fallback).
- **Debounced preview build**:
  - The workbench maintains a lightweight `previewKey` derived from `theme`, `selection`, and slide text/media.
  - When it changes, we debounce `api.buildEditor({ deck, selections, theme, theme_meta })` and update the right‑hand preview; a small “preview updating…” hint appears while the call is in flight.
- **Layout selection**: We reuse `LayoutPicker` and pass `counts` (`text_count`, `image_count`) so the picker can surface the most relevant options. `onAutoFit` is still supported.
- **Media panel**: Simple *replace/remove/add* actions per slot using `onOpenMediaLibrarySlot`. The next empty slot index is derived from `slide.media.length`.
- **Save UX**:
  - `ContentPanel` owns **Save / Cancel**, tracks a `dirty` bit by comparing current local state to `sectionsFromSlide(slide)` and `slide.title`, and disables Save when no changes exist.
  - On successful save we now raise a toast (see **Toasts** below).

### Toasts

We already ship a small toast system in `ui/toast` (context + viewport). The editor now uses it to acknowledge saves and surface errors.

```tsx
import { useToast } from "@/components/ui/toast";

const { show } = useToast();
show({ title: "Saved", description: "Text sections updated.", tone: "success" });
```

> **Note:** The provider must wrap the app (e.g. in `App.tsx`) so the viewport is mounted once and toasts stack in the bottom‑right corner.

### Component boundaries (contracts)

- `EditorWorkbench`
  - Props: deck, slides, theme, layouts, `selection`, `onSelectLayout`, `onAutoFit`, `onUpdateSlide`, `onOpenMediaLibrarySlot`, request/export meta.
  - Responsibilities: slide tabs, wiring, debounced `buildEditor`, right‑pane preview.
- `ContentPanel`
  - Props: `slide`, `slideIndex`, `onUpdateSlide`, `requestRebuild`.
  - Responsibilities: title input, `BlocksEditor`, Save/Cancel; sanitizes sections and calls `applySectionsToSlide` before pushing the update.
- `BlocksEditor`
  - Inputs/outputs a `TextSection[]` only; no deck knowledge. Emits **Ctrl/Cmd+S** via `onRequestSave` and **Esc** via `onRequestCancel`.
- `ActiveSlideStage`
  - Inputs: `doc: EditorDocOut | null` and `activeIndex`. Renders a single slide using `LayerView` with the theme defaults.
- `LayerView`
  - Renders `textbox`, `image`, and simple `shape` layers with scaled frames; expects its parent to be `position: relative`.

### Data model recap (frontend)

```ts
type TextSection =
  | { id: string; kind: "paragraph"; text: string; role?: "primary" | "secondary" | null }
  | { id: string; kind: "list"; bullets: string[]; role?: "primary" | "secondary" | null };
```

- Stored at `slide.meta.sections`.
- Primary list (if any) is mirrored into `slide.bullets` for legacy consumers.
- The backend remains unchanged; the editor sends a standard `Deck` to `buildEditor`.

### Gotchas & tips

- If preview text doesn’t show: ensure **Save** was clicked (or title blurred), and confirm `slide.meta.sections` contains non‑empty sections.
- Paragraph sections must have at least 1 character after trimming; empty items will be dropped by `sanitizeSections`.
- The preview container **must** be `position: relative` (handled by `ActiveSlideStage`).

### Editor Workbench
- Real-time preview from a debounced editor doc (`useDebouncedEditorDoc`).
- Tabs: **Content** (edits sections), **Layout** (picker + Auto-fit), **Media**.
- Auto-fit calls `/layouts/filter` using:
  - `text_count`: number of `meta.sections` if present, else 1 if legacy bullets exist, else **1 if title is non-empty**, otherwise 0.
  - `image_count`: current `slide.media.length`.

### Media Library Drawer
- Opens per-slide with optional `slotIndex` for replace.
- Top half: extracted assets grid (scrollable).
- Bottom half: in-drawer **Generate with AI** (uses `/images/generate`).
  A pill shows the active provider (`/images/provider`).
- Selecting an item updates:
  - Backend shape: `media[i].source = "asset" | "external"`.
  - UI plan tag: `"library" | "external" | "generated"`.

### Image sources
- “Library” assets → `source: "asset"`.
- External URLs & AI data URLs → `source: "external"`.
