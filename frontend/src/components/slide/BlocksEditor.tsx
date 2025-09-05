import { useState } from "react";
import type { TextSection } from "../../types/deck";
import {
  BULLETS_MAX,
  PARA_MAX,
  cryptoRandomId,
  normalizeBulletsInput,
} from "./sections";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import Select from "../ui/Select";
import { useToast } from "../ui/Toast";

type Props = {
  sections: TextSection[];
  onChange: (next: TextSection[]) => void;
  onRequestSave: () => void | Promise<void>;
  onRequestCancel: () => void;
  showActions?: boolean;
};

export default function BlocksEditor({
  sections,
  onChange,
  onRequestSave,
  onRequestCancel,
  showActions = true,
}: Props) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    try {
      setSaving(true);
      await Promise.resolve(onRequestSave());
      show({ title: "Saved", description: "Text sections updated.", tone: "success", timeoutMs: 1600 });
    } catch (err: any) {
      show({ title: "Couldn't save", description: err?.message ?? "Please try again.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    onRequestCancel();
    show({ title: "Changes discarded", tone: "info", timeoutMs: 1400 });
  }

  function addSection(kind: TextSection["kind"]) {
    const base: TextSection =
      kind === "paragraph"
        ? { id: cryptoRandomId(), kind, text: "", role: "secondary" }
        : { id: cryptoRandomId(), kind, bullets: [], role: "secondary" };
    onChange([...sections, base]);
  }

  function removeSection(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }

  function moveSection(id: string, dir: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const to = Math.max(0, Math.min(sections.length - 1, idx + dir));
    if (to === idx) return;
    const next = [...sections];
    const [item] = next.splice(idx, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function setPrimary(id: string) {
    onChange(
      sections.map((s) =>
        s.id === id ? { ...s, role: "primary" } : { ...s, role: s.role === "primary" ? "secondary" : s.role ?? null },
      ),
    );
  }

  function changeKind(id: string, target: TextSection["kind"]) {
    onChange(
      sections.map((s) => {
        if (s.id !== id) return s;
        if (target === s.kind) return s;
        if (target === "paragraph") {
          const text = s.kind === "paragraph" ? (s.text ?? "") : (s.bullets ?? []).join("\n");
          return { id: s.id, kind: "paragraph", text, role: s.role ?? null };
        } else {
          const bullets = s.kind === "list" ? (s.bullets ?? []) : normalizeBulletsInput(s.text ?? "");
          return { id: s.id, kind: "list", bullets, role: s.role ?? null };
        }
      }),
    );
  }

  function updateParagraphText(id: string, text: string) {
    onChange(sections.map((s) => (s.id === id && s.kind === "paragraph" ? { ...s, text } : s)));
  }

  function updateListBullets(id: string, bullets: string[]) {
    // clamp & clean is handled by normalizeBulletsInput before calling this
    onChange(
      sections.map((s) => (s.id === id && s.kind === "list" ? { ...s, bullets: bullets.slice(0, BULLETS_MAX) } : s)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Text sections</label>
        <div className="flex gap-2">
          <Button size="xs" onClick={() => addSection("paragraph")}>+ Paragraph</Button>
          <Button size="xs" onClick={() => addSection("list")}>+ Bullet list</Button>
        </div>
      </div>

      {sections.map((s, idx) => (
        <div key={s.id} className="rounded-xl border p-3 bg-gray-50/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-2">
                <Select value={s.kind} onChange={(e) => changeKind(s.id, e.target.value as TextSection["kind"])}>
                  <option value="paragraph">Paragraph</option>
                  <option value="list">Bullet list</option>
                </Select>

                {s.role === "primary" ? (
                  <span className="inline-block rounded-full bg-black text-white px-2 py-0.5">primary</span>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setPrimary(s.id)} title="Mark primary">
                    make primary
                  </Button>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <IconButton label="Move section up" onClick={() => moveSection(s.id, -1)} disabled={idx === 0}>↑</IconButton>
              <IconButton label="Move section down" onClick={() => moveSection(s.id, +1)} disabled={idx === sections.length - 1}>↓</IconButton>
              <IconButton label="Remove section" onClick={() => removeSection(s.id)}>✕</IconButton>
            </div>
          </div>

          {s.kind === "paragraph" ? (
            <>
              <textarea
                value={s.text ?? ""}
                onChange={(e) => {
                  const value = e.target.value.slice(0, PARA_MAX);
                  // smart convert to list if the user starts with "- " / "* " / "1. " etc.
                  if (/^\s*(?:[-*•·]|\d+[.)])\s+/.test(value)) {
                    const bullets = normalizeBulletsInput(value);
                    onChange(
                      sections.map((sec) =>
                        sec.id === s.id
                          ? ({ id: s.id, kind: "list", bullets, role: s.role ?? null } as TextSection)
                          : sec,
                      ),
                    );
                  } else {
                    updateParagraphText(s.id, value);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancel();
                  }
                }}
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
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    handleSave();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancel();
                    return;
                  }
                  // Enter = new bullet, Shift+Enter = newline in current bullet
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const current = s.kind === "list" ? (s.bullets ?? []) : [];
                    updateListBullets(s.id, [...current, ""]);
                  }
                }}
                rows={Math.max(3, Math.min(10, (s.kind === "list" ? (s.bullets ?? []).length : 0) || 3))}
                className="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white"
                placeholder={"Type and press Enter to add a bullet\n(Shift+Enter for a newline inside a bullet)"}
              />
              <div className="mt-1 text-[11px] text-right text-gray-500">
                {(s.kind === "list" ? (s.bullets ?? []).length : 0)}/{BULLETS_MAX} bullets
              </div>
            </>
          )}
        </div>
      ))}

      {showActions && (
        <div className="flex items-center gap-2 pt-1">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleCancel}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
