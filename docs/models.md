# Data Models (Canonical)

This document defines the JSON/TypeScript models used by PresenTuneAI. All coordinates are **pixel-based** in an editor canvas whose default page size is **1280×720** (16:9).

> Quick map of the flow: **Deck (outline)** → **EditorDoc (exact canvas layers)** → **PPTX export**

---

## 1) Deck (outline)

The **Deck** is the extracted/outlined content before exact positioning.

### TypeScript

```ts
export type Media = { type: "image"; url: string; alt?: string; source?: string; asset_id?: string };

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
      "bullets": ["Form teams", "Pick a problem"],   // legacy mirror
      "media": [{ "type": "image", "url": "https://picsum.photos/seed/s1/800/400", "alt": "teams" }]
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

## 4) ExportResponse

The export endpoint returns location and stats of the generated file.

```ts
export type ExportResponse = {
  path: string;          // relative path served by /v1/export/{filename}
  format: "pptx"|"txt";
  theme: string;
  bytes: number;
};
```

**Export behavior summary** (see `api.md` for details):
- Slide size equals `EditorDoc.page` (px) converted to **EMU** using 96 dpi (1 in = 96 px = 72 pt; 1 in = 914400 EMU).  
- Text uses style mapping with `pt = px * 0.75`, word-wrap on, alignment mapped to PPTX.  
- Images use `fit`: `cover` crops equally; `contain` letterboxes; `fill` stretches.  
- Backgrounds: solid color fill only (for now).  
- Fallback: `.txt` written if `python-pptx` is unavailable.
