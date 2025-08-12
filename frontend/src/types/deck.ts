export type Media = {
  type: "image";
  url: string;          // HttpUrl on backend
  alt?: string | null;
};

export type Slide = {
  id: string;           // uuid/ulid from backend
  title: string;
  bullets: string[];    // trimmed in backend
  notes?: string | null;
  layout: "title" | "title-bullets" | "two-col";
  media: Media[];
};

export type Deck = {
  version: string;      // SCHEMA_VERSION (v1.0.0…)
  topic?: string | null;
  source?: Record<string, unknown> | null; // e.g., { file_id, filename }
  slide_count: number;  // backend validates/syncs this
  created_at: string;   // ISO timestamp
  slides: Slide[];
};

// Request payloads (align with OutlineRequest)
export type OutlineRequest = {
  topic?: string | null;
  text?: string | null;
  slide_count?: number; // 1..15 (backend clamps)
};
