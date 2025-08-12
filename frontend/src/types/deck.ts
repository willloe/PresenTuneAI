export type Media = { type: "image"; url: string; alt?: string | null };

export type Slide = {
  id: string;
  title: string;
  bullets: string[];
  notes?: string | null;
  layout: "title" | "title-bullets" | "two-col";
  media: Media[];
};

export type Deck = {
  version: string;
  topic?: string | null;
  source?: Record<string, unknown> | null;
  slide_count: number;
  created_at: string; // ISO
  slides: Slide[];
};
