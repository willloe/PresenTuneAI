import type { Deck } from "../types/deck";
import type { TextSection } from "../types/deck";
import { sectionsFromSlide, sanitizeSections } from "../components/slide/sections";

/** Flatten lists + each non-empty paragraph line into bullets for the current builder. */
export function bulletsFromSectionsForBuilder(sections: TextSection[], max = 50): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (s.kind === "list") {
      for (const b of s.bullets ?? []) {
        const t = String(b || "").trim();
        if (t) out.push(t);
        if (out.length >= max) return out;
      }
    } else if (s.kind === "paragraph") {
      for (const line of String(s.text || "").split(/\r?\n+/)) {
        const t = line.trim();
        if (t) out.push(t);
        if (out.length >= max) return out;
      }
    }
  }
  return out.slice(0, max);
}

/** Return a slide with sanitized sections and derived bullets. */
export function applySectionsToSlide<S extends Deck["slides"][number]>(slide: S, keepTitle?: string): S {
  const raw = (slide.meta as any)?.sections ?? sectionsFromSlide(slide);
  const clean = sanitizeSections(raw);
  const bullets = bulletsFromSectionsForBuilder(clean);
  return {
    ...slide,
    title: typeof keepTitle === "string" ? keepTitle : slide.title,
    bullets,
    meta: { ...(slide.meta ?? {}), sections: clean },
  } as S;
}

/** Sanitize the whole deck so preview/export sees exactly what the editor shows. */
export function sanitizeDeckForApi(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s) => applySectionsToSlide(s)),
  };
}
