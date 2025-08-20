import { useEffect, useMemo, useState } from "react";
import type { Slide, Media, TextSection } from "../types/deck";
import ImageGalleryEditor, { type MediaItem } from "./ImageGalleryEditor";

/* ------------------------- Config & small helpers ------------------------- */

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const BULLETS_MAX = 12;
const PARA_MAX = 4000;

function trimLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeBulletsInput(input: string): string[] {
  return trimLines(input)
    .map((s) => s.replace(/^(\d+[.)]\s*|[-*•·]\s*)/, ""))
    .slice(0, BULLETS_MAX);
}

function sectionsFromSlide(slide: Slide): TextSection[] {
  const existing = slide.meta?.sections ?? null;
  if (Array.isArray(existing) && existing.length) {
    return existing.map((s) => ({ ...s })); // shallow clone
  }
  const bullets = (slide.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  if (bullets.length) {
    return [
      {
        id: cryptoRandomId(),
        kind: "list",
        bullets,
        role: "primary",
      },
    ];
  }
  return [{ id: cryptoRandomId(), kind: "paragraph", text: "", role: "primary" }];
}

function cryptoRandomId() {
  try {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `sec_${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `sec_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Return sanitized sections (trim, drop empties, clamp bullets). */
function sanitizeSections(sections: TextSection[]): TextSection[] {
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

/** Pick the "primary" list (or first list) to mirror into legacy slide.bullets. */
function derivePrimaryBullets(sections: TextSection[]): string[] {
  const list =
    (sections.find((s) => s.kind === "list" && s.role === "primary") as any) ||
    (sections.find((s) => s.kind === "list") as any);
  const bullets = (list?.bullets ?? []).map((b: string) => b.trim()).filter(Boolean).slice(0, BULLETS_MAX);
  return bullets;
}

/* ------------------------------ Component API ----------------------------- */

type Props = {
  slide: Slide;
  index: number;
  total: number;

  loading: boolean;
  regenIndex: number | null;
  showImages: boolean;

  onRegenerate: (i: number) => Promise<void>;
  onUpdate: (index: number, next: Slide) => void;

  layoutName?: string;
  onReorder?: (from: number, to: number) => void;

  // Optional legacy single-image hooks
  onSetImage?: (index: number, url: string, alt?: string) => void;
  onRemoveImage?: (index: number) => void;
  onGenerateImage?: (index: number) => void;
};

export default function SlideCard({
  slide,
  index,
  total,
  loading,
  regenIndex,
  showImages,
  onRegenerate,
  onUpdate,
  layoutName,
  onReorder,
  onSetImage,
  onRemoveImage,
  onGenerateImage,
}: Props) {
  /* ------------------------------ Local editing ------------------------------ */

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(slide.title);
  const [sections, setSections] = useState<TextSection[]>(sectionsFromSlide(slide));
  const [dirty, setDirty] = useState(false);

  // For the quick URL box
  const [imgUrl, setImgUrl] = useState(slide.media?.[0]?.url ?? "");

  useEffect(() => {
    setTitle(slide.title);
    setSections(sectionsFromSlide(slide));
    setDirty(false);
    setImgUrl(slide.media?.[0]?.url ?? "");
  }, [slide.id, slide.title, slide.meta?.sections, slide.bullets, slide.media]);

  const titleTrim = (title || "").trim();
  const titleValid = titleTrim.length >= TITLE_MIN && titleTrim.length <= TITLE_MAX;

  const isRegenning = regenIndex === index;
  const isBusy = loading || isRegenning;

  const canUp = index > 0;
  const canDown = index < total - 1;

  function startEdit() {
    if (isBusy) return;
    setEditing(true);
    setDirty(false);
  }
  function cancelEdit() {
    setEditing(false);
    setTitle(slide.title);
    setSections(sectionsFromSlide(slide));
    setDirty(false);
  }
  function saveEdit() {
    if (!dirty || !titleValid) return;
    const clean = sanitizeSections(sections);
    const next: Slide = {
      ...slide,
      title: titleTrim,
      bullets: derivePrimaryBullets(clean), // mirror for back-compat
      meta: { ...(slide.meta ?? {}), sections: clean },
    };
    onUpdate(index, next);
    setEditing(false);
    setDirty(false);
  }

  function moveUp() {
    if (!canUp || !onReorder) return;
    onReorder(index, index - 1);
  }
  function moveDown() {
    if (!canDown || !onReorder) return;
    onReorder(index, index + 1);
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  /* --------------------------- Sections: operations -------------------------- */

  function updateParagraphText(id: string, text: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id && s.kind === "paragraph" ? { ...s, text } : s)),
    );
    setDirty(true);
  }

  function updateListBullets(id: string, bullets: string[]) {
    setSections((prev) =>
      prev.map((s) => (s.id === id && s.kind === "list" ? { ...s, bullets } : s)),
    );
    setDirty(true);
  }

  function addSection(kind: TextSection["kind"]) {
    const base: TextSection =
      kind === "paragraph"
        ? { id: cryptoRandomId(), kind, text: "", role: "secondary" }
        : { id: cryptoRandomId(), kind, bullets: [], role: "secondary" };
    setSections((prev) => [...prev, base]);
    setDirty(true);
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const to = Math.max(0, Math.min(prev.length - 1, idx + dir));
      if (to === idx) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  }

  function setPrimary(id: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, role: "primary" } : { ...s, role: s.role === "primary" ? "secondary" : s.role ?? null },
      ),
    );
    setDirty(true);
  }

  function changeKind(id: string, target: TextSection["kind"]) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (target === s.kind) return s;
        if (target === "paragraph") {
          const text = s.kind === "paragraph" ? (s.text ?? "") : (s.bullets ?? []).join("\n");
          const next: TextSection = { id: s.id, kind: "paragraph", text, role: s.role ?? null };
          return next;
        } else {
          const bullets = s.kind === "list" ? (s.bullets ?? []) : normalizeBulletsInput(s.text ?? "");
          const next: TextSection = { id: s.id, kind: "list", bullets, role: s.role ?? null };
          return next;
        }
      }),
    );
    setDirty(true);
  }

  /* ------------------------------- Media logic ------------------------------- */

  const media: MediaItem[] = useMemo(() => {
    const arr = (slide.media || []) as Media[];
    return arr
      .map((m) => (m?.url ? { type: "image" as const, url: String(m.url), alt: m.alt ?? undefined } : null))
      .filter(Boolean) as MediaItem[];
  }, [slide.media]);

  function updateMedia(nextMedia: MediaItem[]) {
    const next: Slide = { ...slide, media: nextMedia as any };
    onUpdate(index, next);
  }
  function addImage(url: string, alt?: string) {
    const next = [...media, { type: "image" as const, url, alt: alt ?? slide.title }];
    if (!media.length && onSetImage) onSetImage(index, url, alt ?? slide.title);
    else updateMedia(next);
  }
  function replaceImage(at: number, url: string, alt?: string) {
    if (at === 0 && onSetImage) {
      onSetImage(index, url, alt ?? slide.title);
      return;
    }
    const next = [...media];
    next[at] = { type: "image" as const, url, alt: alt ?? next[at]?.alt };
    updateMedia(next);
  }
  function removeImageAt(at: number) {
    if (at === 0 && media.length === 1 && onRemoveImage) {
      onRemoveImage(index);
      return;
    }
    const next = media.slice(0, at).concat(media.slice(at + 1));
    updateMedia(next);
  }
  function moveImage(from: number, to: number) {
    if (from === to) return;
    const clampedTo = Math.max(0, Math.min(media.length - 1, to));
    const next = [...media];
    const [m] = next.splice(from, 1);
    next.splice(clampedTo, 0, m);
    updateMedia(next);
  }
  function aiGenerate(at?: number) {
    if (onGenerateImage) {
      onGenerateImage(index);
      return;
    }
    const seed = `${slide.id || index}-${Date.now()}`;
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/400`;
    if (typeof at === "number" && media[at]) replaceImage(at, url, slide.title);
    else addImage(url, slide.title);
  }

  const showSkeleton = showImages && !editing && !media.length && isBusy;

  /* --------------------------------- Render --------------------------------- */

  const selectedLayout = layoutName ?? (slide.layout || "");

  return (
    <li className="border rounded-xl p-4">
      {/* Header / actions */}
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold break-words">{slide.title}</div>
            {selectedLayout ? (
              <div className="mt-1">
                <span className="inline-block text-[11px] rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                  {selectedLayout}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={moveUp}
              disabled={!canUp}
              className={`rounded-lg border px-2 py-1 text-xs ${
                canUp ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              }`}
              title="Move up"
              aria-label={`Move slide ${index + 1} up`}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={moveDown}
              disabled={!canDown}
              className={`rounded-lg border px-2 py-1 text-xs ${
                canDown ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
              }`}
              title="Move down"
              aria-label={`Move slide ${index + 1} down`}
            >
              ▼
            </button>

            <button
              type="button"
              onClick={startEdit}
              disabled={isBusy}
              className={`rounded-lg border px-2 py-1 text-xs ${
                isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title="Edit slide"
              aria-label={`Edit slide ${index + 1}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(index)}
              disabled={isRegenning}
              className={`rounded-lg border px-2 py-1 text-xs ${
                isRegenning ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title="Regenerate this slide"
              aria-label={`Regenerate slide ${index + 1}`}
            >
              {isRegenning ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            onKeyDown={onTitleKeyDown}
            className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring ${
              titleValid ? "" : "border-red-500"
            }`}
            maxLength={TITLE_MAX}
            placeholder="Slide title"
            aria-invalid={!titleValid}
            aria-label={`Slide ${index + 1} title`}
          />
          <div className="text-[11px] text-gray-500 text-right">{titleTrim.length}/{TITLE_MAX}</div>
        </div>
      )}

      {/* Read-only content preview */}
      {!editing ? (
        <div className="mt-2 space-y-2">
          {(slide.meta?.sections ?? sections).map((s: TextSection, i: number) =>
            s.kind === "paragraph" ? (
              <p key={s.id || i} className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">
                {s.text}
              </p>
            ) : (
              <ul key={s.id || i} className="list-disc ml-6">
                {s.bullets.map((b: string, j: number) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ),
          )}
          {!slide.meta?.sections?.length && slide.bullets?.length ? (
            <ul className="list-disc ml-6">
              {slide.bullets.map((b: string, j: number) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        /* ---------------------------- Sections editor ---------------------------- */
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Text sections</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addSection("paragraph")}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
              >
                + Paragraph
              </button>
              <button
                type="button"
                onClick={() => addSection("list")}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
              >
                + Bullet list
              </button>
            </div>
          </div>

          {sections.map((s, idx) => (
            <div key={s.id} className="rounded-xl border p-3 bg-gray-50/50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <select
                      value={s.kind}
                      onChange={(e) => changeKind(s.id, e.target.value as TextSection["kind"])}
                      className="rounded-md border px-2 py-1 bg-white"
                    >
                      <option value="paragraph">Paragraph</option>
                      <option value="list">Bullet list</option>
                    </select>
                    {s.role === "primary" ? (
                      <span className="inline-block rounded-full bg-black text-white px-2 py-0.5">primary</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPrimary(s.id)}
                        className="text-xs underline text-gray-700"
                        title="Mark this section as primary"
                      >
                        make primary
                      </button>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(s.id, -1)}
                    disabled={idx === 0}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      idx === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"
                    }`}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(s.id, +1)}
                    disabled={idx === sections.length - 1}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      idx === sections.length - 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"
                    }`}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(s.id)}
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
                    title="Remove section"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {s.kind === "paragraph" ? (
                <>
                  <textarea
                    value={s.text ?? ""}
                    onChange={(e) => updateParagraphText(s.id, e.target.value.slice(0, PARA_MAX))}
                    rows={Math.max(2, Math.min(8, (s.text ?? "").split(/\r?\n/).length))}
                    className="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white"
                    placeholder="Write a short paragraph…"
                  />
                  <div className="mt-1 text-[11px] text-right text-gray-500">
                    {(s.text ?? "").length}/{PARA_MAX}
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    value={(s.bullets ?? []).join("\n")}
                    onChange={(e) => updateListBullets(s.id, normalizeBulletsInput(e.target.value))}
                    rows={Math.max(3, Math.min(10, (s.bullets ?? []).length || 3))}
                    className="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white"
                    placeholder={"- First point\n- Second point"}
                  />
                  <div className="mt-1 text-[11px] text-gray-500">
                    {(s.bullets ?? []).length}/{BULLETS_MAX} bullets
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!titleValid || !dirty}
              className={`rounded-lg px-3 py-1 text-sm text-white ${
                !titleValid || !dirty ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
              }`}
            >
              Save
            </button>
            <button type="button" onClick={cancelEdit} className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Images: quick preview of first image */}
      {showImages && !editing && (media[0] ? (
        <div className="mt-2">
          <img
            src={media[0].url}
            alt={media[0].alt ?? slide.title}
            className="w-full h-40 object-cover rounded-lg border bg-gray-100"
            loading="lazy"
          />
          {media[0].alt && <div className="mt-1 text-xs text-gray-500">{media[0].alt}</div>}
        </div>
      ) : showSkeleton ? (
        <div className="mt-2 h-40 w-full rounded-lg bg-gray-100 animate-pulse" />
      ) : null)}

      {/* Full image gallery editor */}
      <div className="mt-3">
        <ImageGalleryEditor
          items={media}
          onAdd={(url: string, alt?: string) => addImage(url, alt)}
          onReplace={(at: number, url: string, alt?: string) => replaceImage(at, url, alt)}
          onRemove={(at: number) => removeImageAt(at)}
          onMove={(from: number, to: number) => moveImage(from, to)}
          onAIGenerate={(at?: number) => aiGenerate(at)}
        />
      </div>

      {/* Quick actions (legacy single-image) */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://… (image URL)"
            className="min-w-[12rem] flex-1 rounded-xl border px-3 py-2 outline-none focus:ring"
          />
          <button
            type="button"
            onClick={() => {
              if (!imgUrl) return;
              if (media.length === 0 && onSetImage) onSetImage(index, imgUrl, slide.title);
              else if (media.length === 0) addImage(imgUrl, slide.title);
              else replaceImage(0, imgUrl, slide.title);
            }}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
          >
            {media.length ? "Replace" : "Add Image"}
          </button>
          <button
            type="button"
            onClick={() => aiGenerate()}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            title="Generate placeholder image"
          >
            AI Generate
          </button>
          {media.length ? (
            <button
              type="button"
              onClick={() => {
                if (onRemoveImage && media.length === 1) onRemoveImage(index);
                else removeImageAt(0);
              }}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
