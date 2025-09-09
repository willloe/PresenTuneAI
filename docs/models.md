# Data Models (Canonical)

This document defines the JSON/TypeScript models used by PresenTuneAI. All coordinates are **pixel-based** in an editor canvas whose default page size is **1280×720** (16:9). The sections here **only add information** to the earlier document—no breaking changes.

> Flow: **Deck (outline)** → **EditorDoc (exact canvas layers)** → **PPTX export**

---

## 1) Deck (outline)

The **Deck** is the extracted/outlined content before exact positioning.

### TypeScript

```ts
export type Media = {
  type: "image";
  url: string;
  alt?: string;
  source?: "external" | "asset";   // NEW: provenance hint used by exporter
  asset_id?: string;               // when sourced from /v1/assets
};

export type TextSection =
  | { id: string; kind: "paragraph"; text: string; role?: "primary" | "secondary" | string }
  | { id: string; kind: "list"; bullets: string[]; role?: "primary" | "secondary" | string };

export type Slide = {
  id: string;
  title: string;
  bullets?: string[];          // legacy mirror of the primary list section (if present)
  media?: Media[];             // zero or more images
  notes?: string;
  meta?: {
    sections?: TextSection[];  // canonical multi-section text model
    [k: string]: any;
  };
};

export type Deck = {
  topic: string;
  slide_count: number;
  slides: Slide[];
};
```

### JSON example

```json
{
  "topic": "AI Hackathon",
  "slide_count": 3,
  "slides": [
    {
      "id": "s1",
      "title": "Welcome",
      "meta": {
        "sections": [
          { "id": "p1", "kind": "paragraph", "text": "Our goals for today…" },
          { "id": "l1", "kind": "list", "bullets": ["Form teams", "Pick a problem"], "role": "primary" }
        ]
      },
      "bullets": ["Form teams", "Pick a problem"],
      "media": [
        { "type": "image", "url": "https://picsum.photos/seed/s1/800/400", "alt": "teams", "source": "external" }
      ]
    }
  ]
}
```

---

## 2) Layout Library

Layouts describe **frames** into which we place text and images to create an **EditorDoc**. These are loaded from `app/static/layouts/layouts.json` with normalization rules (see below).

### TypeScript

```ts
export type Frame = { x: number; y: number; w: number; h: number };

export type LayoutItem = {
  id: string;
  name: string;
  supports: {
    text_min?: number;    // min bullet/section count supported
    text_max?: number;
    images_min?: number;
    images_max?: number;
  };
  weight: number;         // higher weight → more preferred by filter
  preview_url?: string;   // optional thumbnail
  frames: {
    title?: Frame;
    bullets?: Frame[];    // one or more list frames
    images?: Frame[];     // zero or more image frames
    // future: paragraphs?: Frame[], caption?: Frame, shapes?: …
  };
  style?: Record<string, any>;
};

export type LayoutLibrary = {
  items: LayoutItem[];
  page: number;
  page_size: number;
  total: number;
};
```

### Normalization rules (backend accepts both “old” and “new” forms)

- `supports` can be provided as `{ text_count, image_count }` → normalized to ranges:  
  `text_min = 0, text_max = text_count`, `images_min = 0, images_max = image_count`.
- `frames`: keys `img0`, `img1`, … are merged into `frames.images[]`.
- `frames.bullets` can be a single object or an array → normalized to array.

### Minimal item example

```json
{
  "id": "title_image_right",
  "name": "Title + Big Image (Right)",
  "supports": { "text_count": 1, "image_count": 1 },
  "weight": 1.0,
  "frames": {
    "title": { "x": 80, "y": 64, "w": 720, "h": 80 },
    "images": [{ "x": 840, "y": 140, "w": 360, "h": 360 }]
  }
}
```

### Multi-image and multi-text example

```json
{
  "id": "two_col_text_gallery",
  "name": "Two Columns (Text + 2 Images)",
  "supports": { "text_min": 1, "text_max": 10, "images_min": 1, "images_max": 2 },
  "weight": 0.9,
  "frames": {
    "title": { "x": 80, "y": 64, "w": 1120, "h": 80 },
    "bullets": [{ "x": 80, "y": 170, "w": 540, "h": 360 }],
    "images": [
      { "x": 660, "y": 170, "w": 540, "h": 170 },
      { "x": 660, "y": 360, "w": 540, "h": 170 }
    ]
  },
  "style": { "title": { "font": "Inter", "size": 36, "weight": 700 } }
}
```

---

## 3) EditorDoc (exact positioning)

**EditorDoc** is the canvas-layer representation built by `/v1/editor/build` and rendered/exported exactly.

### TypeScript

```ts
export type EditorFrame = { x: number; y: number; w: number; h: number };

export type TextStyle = {
  font?: string;          // default "Inter"
  size?: number;          // px (export uses size*0.75 pt)
  weight?: number;        // >=600 = bold
  color?: string;         // hex, default #111111
  align?: "left"|"center"|"right"|"justify";
};

export type EditorLayer =
  | {
      id: string;
      kind: "textbox";
      frame: EditorFrame;
      text: string;
      style?: TextStyle;
      z?: number;
    }
  | {
      id: string;
      kind: "image";
      frame: EditorFrame;
      source: { type?: "external"|"asset"; url?: string; asset_id?: string };
      fit?: "cover" | "contain" | "fill";  // default "cover"
      z?: number;
    }
  | {
      // NEW: basic rectangle shape support (exporter supports fill+stroke)
      id: string;
      kind: "shape";
      frame: EditorFrame;
      style?: { fill?: string; stroke?: string; strokeWidth?: number };
      z?: number;
    };

export type EditorSlide = {
  id: string;
  name: string;
  layers: EditorLayer[];  // sorted by z ascending in the UI
  background?: { fill?: string };
  meta?: Record<string, any>; // e.g., { layout_id: "..." }
};

export type EditorDoc = {
  editor_id: string;
  deck_id: string;
  page: { width: number; height: number; unit?: "px" };
  theme: string;
  slides: EditorSlide[];
  theme_meta?: Record<string, any>; // NEW: forwarded into exporter to theme fonts/colors
  meta?: Record<string, any>;
};
```

### Build rules (Deck → EditorDoc)

- **Title** → placed in `frames.title` when present.  
- **Bullets** → first list or `bullets[]` mirrored from sections goes into `frames.bullets[0]`.  
- **Images** → media list fills `frames.images[]` by order; extra media beyond frames are ignored.  
- **Z-order**: title `z=10`, bullets `z=9`, images `z=6` (can change later).  
- **Policy**:  
  - `best_fit` (default): unknown `layout_id` falls back to the highest-weight layout and emits a warning.  
  - `strict`: unknown `layout_id` returns `400` with a helpful error.  
- **Idempotency**: set `Idempotency-Key` header; 5-minute cache; responses include `{ meta: { idempotency: "HIT" } }` on hits.

---

## 4) Export model

### Request/Response

```ts
export type ExportRequest =
  | { slides: Slide[]; theme?: string; theme_meta?: Record<string, any> }
  | { editor: EditorDoc; theme?: string; theme_meta?: Record<string, any> };

export type ExportResponse = {
  path: string;            // filename written by the backend
  download_url?: string;   // NEW: absolute URL to GET /v1/export/{filename}
  format: "pptx" | "txt";
  theme: string;
  bytes: number;
};
```

**Export behavior summary**:
- Slide size equals `EditorDoc.page` (px) converted to **EMU** using 96 dpi (1 in = 96 px = 72 pt; 1 in = 914400 EMU).  
- Text uses style mapping with `pt = px * 0.75`, word-wrap on, alignment mapped to PPTX.  
- Images use `fit`: `cover` crops equally; `contain` letterboxes; `fill` stretches.  
- Backgrounds: solid color fill only (for now).  
- Fallback: `.txt` written if `python-pptx` is unavailable.

---

## 5) Assets model (media library)

**New:** when the extractor emits images, they are written to `STORAGE_DIR/<upload_id>/assets/` and indexed in an `index.json`. The API serves metadata and files for the Media Library.

```ts
export type Asset = {
  id: string;
  filename: string;
  rel_path: string;     // file path relative to project root (or absolute)
  width?: number;
  height?: number;
  ext?: string;         // ".png", ".jpg", …
  checksum?: string;    // optional
  caption?: string | null;
};

export type AssetList = { items: Asset[]; count: number };
```

Endpoints:

- `GET /v1/assets?upload_id=…` → `{ items, count }`
- `GET /v1/assets/{id}` → `Asset`
- `GET /v1/assets/{id}/file?upload_id=…` → binary image

The frontend uses `assetFileUrl(uploadId, assetId)` to build an `<img src>` compatible URL.

---

## 6) Theme meta (frontend → exporter)

The exporter accepts `theme_meta` (fonts/colors) either from the explicit ExportRequest or forwarded from `EditorDoc.theme_meta`. Minimal example:

```json
{
  "fonts": { "heading": "Inter", "body": "Inter", "weightHeading": 700, "weightBody": 400 },
  "colors": {
    "appBg": "#111827",
    "surface": "#ffffff",
    "text": "#111111",
    "mutedText": "#475569",
    "border": "#E5E7EB",
    "accent": "#2563EB",
    "accentContrast": "#ffffff",
    "accentSoft": "#DBEAFE"
  }
}
```

These defaults are safe; missing keys are backfilled in the exporter.

---
## 2025-09-09 – Models Addendum

### Text Sections (canonical)

`Slide.meta.sections` is the canonical text model and can be **omitted** or **empty** for title‑only slides.

#### `ParagraphSection`
```ts
kind: "paragraph"
id: string         // client generated
text: string       // may be empty ("") for placeholder paragraphs
role?: string
```

> The minimum length for `ParagraphSection.text` is now **0** to allow temporary empty paragraphs in the editor UI.

#### `ListSection`
```ts
kind: "list"
id: string
bullets: string[]  // server trims empty entries
role?: string
```

### Legacy bullets mirroring

- If a primary `ListSection` exists, its bullets are mirrored to legacy `Slide.bullets` for backward compatibility.
- If there are **no** sections but legacy `bullets` exist, the server synthesizes a primary `ListSection`.
- If there are paragraphs (or other sections) and **no** list section, legacy `bullets` is **cleared** server‑side to avoid drift.

### Media

```ts
type Media = {
  type: "image",
  url?: string,           // HttpUrl (can be data: URL for in‑memory images)
  alt?: string,
  source?: "asset" | "external", // backend literal
  asset_id?: string
}
```

> The UI may also track `source` as `"library" | "generated" | "external" | "empty"` in its internal plan, but the **backend accepts only** `"asset"` or `"external"`.

### Slide

```ts
id: string
title: string
bullets?: string[]          // legacy mirror
notes?: string
layout?: string             // advisory; used by /editor/build
media?: Media[]
meta?: { sections?: (ParagraphSection | ListSection)[] }
```

Title‑only slides are valid: `meta.sections` can be `null`/`[]`, and there is **no requirement** to include a paragraph or list.

### Deck

- `slide_count` is normalized server‑side to `len(slides)`.
- `version` is set from `SCHEMA_VERSION`.
