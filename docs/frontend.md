# Frontend

This file documents how the UI is wired and how to extend it.

---

## Phase flow (App.tsx)

The app guides users through five phases. State is kept locally with a few `useState` hooks and custom hooks for outline generation and local storage.

1. **Upload Extract** – `UploadSection` → `/v1/upload`
2. **Outline Generate** – `OutlineControls` → `/v1/outline`
3. **Edit & Assign** – `Preview` (list of `SlideCard`s)
4. **Layout Selection** – `LayoutPicker` + **Build Editor Doc**
5. **Finalize & Export** – `EditorPreview` + **Export**

Important flags/state in `App.tsx`:

- `layouts` – fetched once via `api.layouts()`.
- `selection` – map of `slide_id → layout_id`.
- `editorResp` – result of `/editor/build` containing an `EditorDoc`.
- `exportInfo` – result of `/export` (path, bytes, format).

Idempotency: we generate a persistent `idemKeyRef` per session and pass it as the `Idempotency-Key` header when building the editor to avoid duplicate work on repeated clicks.

---

## Slide editing (`SlideCard.tsx`)

Each slide card lets you:

- **Edit title** (inline, Enter/Escape to save/cancel).
- **Edit bullets** (legacy field). We keep this for compatibility and mirror it into multi‑section text when present.
- **Manage images** with **ImageGalleryEditor**:
  - Add via URL, Replace, Remove, Reorder (↑/↓), and a stub **AI Generate** button.
  - The first image is still surfaced as a large preview.
- **Reorder slides** (▲/▼).
- **Regenerate** a specific slide outline.

> Slide media are normalized to a strict `{ type: "image", url, alt? }[]` shape inside the component to keep the editor predictable.

---

## Layout selection (`LayoutPicker.tsx`)

The layout picker accepts the full library and a `counts` hint (**`{ text_count, image_count }`**) for the current slide. It calls the backend filter to rank layouts and exposes three compact views:

- **Selected** – shows only the chosen layout. Click **Change…** to view recommendations.
- **Recommended** – top‑K ranked by `/layouts/filter`, with the selected item pinned first if present.
- **All** – everything, ordered by score/weight.

Props of note:

```ts
type LayoutPickerProps = {
  items: LayoutItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  counts?: { text_count: number; image_count: number };
  page?: { width?: number; height?: number }; // for aspect ratio
  topK?: number;                      // default 6
  initialView?: "selected"|"recommended"|"all";
  bringToFrontOnSelect?: boolean;     // default true (returns to "selected")
};
```

The card thumbnails are rendered client‑side from layout `frames` (no PNGs required). If you provide `preview_url` in a layout, you can swap the renderer to an `<img>` if desired.

---

## Visual preview (`EditorPreview.tsx`)

Renders the server‑built **EditorDoc** by placing each layer according to its `frame` (x/y/w/h in px on a 1280×720 canvas), honoring `z`‑order and `fit` for images (`cover`/`contain`/`fill`).

Props include grid layout controls (`cols`, `minColPx`, `maxThumbH`), frame outlines for debugging, and a minimum font size clamp for readability.

---

## API client (`src/lib/api.ts`)

A tiny typed wrapper around `fetch`. Key helpers used by the UI:

- `api.layouts()` – `GET /v1/layouts`
- `api.filterLayouts({ components, top_k })` – `POST /v1/layouts/filter`
- `api.buildEditor({ deck, selections, theme, policy }, { idempotencyKey })` – `POST /v1/editor/build`
- `api.exportDeck({ slides? editor?, theme })` – `POST /v1/export`

All functions return `{ data, ok, status }` style objects.

---

## Styling & Accessibility

- Components use Tailwind utility classes; cards/buttons have clear focus styles.
- Keyboard: Enter/Escape in editors, and buttons include `aria-label`s for reorder controls.
- Thumbnails scale responsively using CSS `aspect-ratio` and grid `minmax` columns.

---

## Extending the UI

- **Add new layouts** – just append to `layouts.json` and they appear automatically. The picker will order them via the backend filter; tune `supports` and `weight` to influence ranking.
- **More layer kinds** – extend `EditorPreview` and the backend exporter simultaneously (e.g., tables/shapes/charts). Everything is framed in absolute coordinates, so preview → export stays consistent.
- **Real image generation** – wire `onAIGenerate` to your provider and store assets in your media store; continue returning a resolvable `url` to the frontend.

---

## Troubleshooting

- **I don’t see Server‑Timing in DevTools.** Ensure `TIMING_ALLOW_ORIGIN` in `.env` includes your frontend origin (or `*` in local dev).
- **Layouts list shows only a few items.** Confirm your `app/static/layouts/layouts.json` is present and valid. Use `GET /v1/layouts?reload=true` after edits.
- **Export yields a `.txt`.** That’s the fallback when Python‑pptx is unavailable. Install build deps or use the provided Dockerfile.


## Extra information

### 1) **LayoutPicker** usage
Document the `LayoutPicker` API and the 3 modes:
- `selected` (default view; shows only the current choice, click to change)
- `recommended` (top-K from `/layouts/filter`; can fall back to local scorer)
- `all` (full library)

Props to document: `items`, `selectedId`, `onSelect`, `counts`, `page`, `topK`, `initialView`, `bringToFrontOnSelect`.

### 2) **Aspect ratio & scaling**
Thumbnails preserve aspect ratio from `page.width / page.height`. Frames are rendered in percentages assuming a 1280×720 baseline; they scale responsively.

### 3) **SlideCard** editors
- **Text:** title inline editing; **(optional)** multi-section editor (`TextSectionsEditor`) producing `slide.meta.sections[]` and mirroring primary list to `slide.bullets`.  
- **Images:** `ImageGalleryEditor` supporting add/replace/remove/reorder and an optional “AI Generate” stub.

### 4) **State invalidation logic**
When slides are regenerated or reordered, later steps (editor build/export) are cleared to avoid stale state.