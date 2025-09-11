export type Media = {
  type: "image";
  url: string;                 // HttpUrl on backend
  alt?: string | null;
  source?: "asset" | "external";
  asset_id?: string;
};

export type TextSection =
  | { id: string; kind: "paragraph"; text: string; role?: "primary" | "secondary" | string | null }
  | { id: string; kind: "list"; bullets: string[]; role?: "primary" | "secondary" | string | null };

export type Slide = {
  id: string;                  // uuid/ulid from backend
  title: string;

  // Legacy mirror of the primary list section (if any)
  bullets?: string[] | null;

  notes?: string | null;

  // Layout hint (actual placement happens in /editor/build)
  layout?: "title" | "title-bullets" | "two-col" | string | null;

  // Zero or more images
  media?: Media[] | null;

  // Canonical text model + extension point
  meta?: {
    sections?: TextSection[] | null;
    [k: string]: any;
  } | null;
};

export type Deck = {
  version: string;             // SCHEMA_VERSION (e.g., "1.0")
  topic?: string | null;
  source?: Record<string, unknown> | null; // e.g., { file_id, filename }
  slide_count: number;         // backend validates/syncs this
  created_at: string;          // ISO timestamp
  slides: Slide[];
};

// Request payloads (align with OutlineRequest)
export type OutlineRequest = {
  topic?: string | null;
  text?: string | null;
  slide_count?: number; // 1..15 (backend clamps)
};

/**
 * Derive layout-filter component counts from a slide.
 * Uses canonical meta.sections for text; falls back to legacy bullets as a single text block.
 */
export function deriveComponentsForFilter(
  slide: Slide
): { text_count: number; image_count: number } {
  const sections = slide.meta?.sections;
  const text_count =
    Array.isArray(sections) && sections.length
      ? sections.length
      : (slide.bullets?.length ?? 0) > 0
      ? 1
      : 0;
  const image_count = Array.isArray(slide.media) ? slide.media.length : 0;
  return { text_count, image_count };
}
