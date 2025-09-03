import type { Slide, TextSection } from "../../types/deck";

export const TITLE_MIN = 1;
export const TITLE_MAX = 200;
export const BULLETS_MAX = 12;
export const PARA_MAX = 4000;

export function cryptoRandomId() {
  try {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `sec_${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `sec_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function trimLines(s: string): string[] {
  return (s || "")
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeBulletsInput(input: string): string[] {
  return trimLines(input)
    .map((s) => s.replace(/^(\d+[.)]\s*|[-*•·]\s*)/, ""))
    .slice(0, BULLETS_MAX);
}

/** Build editable sections from a slide (prefers meta.sections, falls back to legacy bullets). */
export function sectionsFromSlide(slide: Slide): TextSection[] {
  const existing = slide.meta?.sections ?? null;
  if (Array.isArray(existing) && existing.length) {
    return existing.map((s) => ({ ...s }));
  }
  const bullets = (slide.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  if (bullets.length) {
    return [{ id: cryptoRandomId(), kind: "list", bullets, role: "primary" }];
  }
  return [{ id: cryptoRandomId(), kind: "paragraph", text: "", role: "primary" }];
}

/** Trim, drop empties, clamp bullets, ensure at least one section. */
export function sanitizeSections(sections: TextSection[]): TextSection[] {
  const out: TextSection[] = [];
  for (const s of sections) {
    if (s.kind === "paragraph") {
      const text = (s.text ?? "").trim();
      if (text) out.push({ id: s.id || cryptoRandomId(), kind: "paragraph", text, role: s.role ?? null });
    } else {
      const bullets = (s.bullets ?? []).map((b) => b.trim()).filter(Boolean).slice(0, BULLETS_MAX);
      if (bullets.length) out.push({ id: s.id || cryptoRandomId(), kind: "list", bullets, role: s.role ?? null });
    }
  }
  if (!out.length) out.push({ id: cryptoRandomId(), kind: "paragraph", text: "", role: "primary" });
  return out;
}

/** Mirror the primary (or first) list back to legacy slide.bullets for back-compat. */
export function derivePrimaryBullets(sections: TextSection[]): string[] {
  const list =
    (sections.find((s) => s.kind === "list" && s.role === "primary") as any) ||
    (sections.find((s) => s.kind === "list") as any);
  return (list?.bullets ?? []).map((b: string) => b.trim()).filter(Boolean).slice(0, BULLETS_MAX);
}
