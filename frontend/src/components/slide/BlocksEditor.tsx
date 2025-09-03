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

type Props = {
  sections: TextSection[];
  onChange: (next: TextSection[]) => void;
  onRequestSave: () => void;   // for Cmd/Ctrl+S
  onRequestCancel: () => void; // for Esc
};

export default function BlocksEditor({
  sections,
  onChange,
  onRequestSave,
  onRequestCancel,
}: Props) {
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
    onChange(sections.map((s) => (s.id === id && s.kind === "list" ? { ...s, bullets } : s)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Text sections</label>
        <div className="flex gap-2">
          <Button size="xs" onClick={() => addSection("paragraph")}>
            + Paragraph
          </Button>
          <Button size="xs" onClick={() => addSection("list")}>
            + Bullet list
          </Button>
        </div>
      </div>

      {sections.map((s, idx) => (
        <div key={s.id} className="rounded-xl border p-3 bg-gray-50/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-2">
                <Select
                  value={s.kind}
                  onChange={(e) => changeKind(s.id, e.target.value as TextSection["kind"])}
                >
                  <option value="paragraph">Paragraph</option>
                  <option value="list">Bullet list</option>
                </Select>

                {s.role === "primary" ? (
                  <span className="inline-block rounded-full bg-black text-white px-2 py-0.5">
                    primary
                  </span>
                ) : (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setPrimary(s.id)}
                    title="Mark this section as primary"
                  >
                    make primary
                  </Button>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <IconButton
                label="Move section up"
                onClick={() => moveSection(s.id, -1)}
                disabled={idx === 0}
              >
                ↑
              </IconButton>
              <IconButton
                label="Move section down"
                onClick={() => moveSection(s.id, +1)}
                disabled={idx === sections.length - 1}
              >
                ↓
              </IconButton>
              <IconButton
                label="Remove section"
                onClick={() => removeSection(s.id)}
              >
                ✕
              </IconButton>
            </div>
          </div>

          {s.kind === "paragraph" ? (
            <>
              <textarea
                value={s.text ?? ""}
                onChange={(e) => updateParagraphText(s.id, e.target.value.slice(0, PARA_MAX))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    onRequestSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onRequestCancel();
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
                    onRequestSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onRequestCancel();
                  }
                }}
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
    </div>
  );
}
