import { useEffect, useMemo, useState } from "react";
import type { Deck } from "../../../../types/deck";
import BlocksEditor from "../../../slide/BlocksEditor";
import { sectionsFromSlide, sanitizeSections } from "../../../slide/sections";
import type { TextSection } from "../../../../types/deck";
import { applySectionsToSlide } from "../../../../utils/textBridge";
import Button from "../../../ui/Button";

type Slide = Deck["slides"][number];

export default function ContentPanel({
  slide,
  slideIndex,
  onUpdateSlide,
  requestRebuild,
}: {
  slide: Slide;
  slideIndex: number;
  onUpdateSlide: (idx: number, next: Slide) => void;
  requestRebuild: (withDeckSlide?: Slide) => Promise<void> | void;
}) {
  const [title, setTitle] = useState(slide.title || "");
  const [sectionsLocal, setSectionsLocal] = useState<TextSection[]>(sectionsFromSlide(slide));
  const [saving, setSaving] = useState(false);

  // re-sync when the slide object changes
  useEffect(() => {
    setTitle(slide.title || "");
    setSectionsLocal(sectionsFromSlide(slide));
  }, [slide.id, slide.title, (slide.meta as any)?.sections]);

  // compare against the current slide to know if anything changed
  const isDirty = useMemo(() => {
    const current = sanitizeSections(sectionsLocal);
    const baseline = sanitizeSections(sectionsFromSlide(slide));
    const titleChanged = (title || "") !== (slide.title || "");
    const sectionsChanged = JSON.stringify(current) !== JSON.stringify(baseline);
    return titleChanged || sectionsChanged;
  }, [title, sectionsLocal, slide]);

  const canSave = isDirty && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const clean = sanitizeSections(sectionsLocal);
      const next = applySectionsToSlide({ ...slide, title } as Slide);
      const merged: Slide = { ...next, meta: { ...(next.meta ?? {}), sections: clean } };
      onUpdateSlide(slideIndex, merged);
      await Promise.resolve(requestRebuild());
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (saving || !isDirty) return;
    setTitle(slide.title || "");
    setSectionsLocal(sectionsFromSlide(slide));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1">Title</label>
        <input
          className="w-full rounded-md border px-2 py-1 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (canSave) void save(); }}
        />
      </div>

      <BlocksEditor
        sections={sectionsLocal}
        onChange={setSectionsLocal}
        onRequestSave={save}
        onRequestCancel={cancel}
        showActions={false}
      />

      <div className="flex gap-2">
        <Button variant="solid" size="sm" onClick={save} disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" onClick={cancel} disabled={!isDirty || saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
