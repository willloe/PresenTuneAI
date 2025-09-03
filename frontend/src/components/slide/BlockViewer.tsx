import type { TextSection } from "../../types/deck";

export default function BlockViewer({ sections }: { sections: TextSection[] }) {
  if (!sections?.length) return null;
  return (
    <div className="space-y-2">
      {sections.map((s) =>
        s.kind === "paragraph" ? (
          <p key={s.id} className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">
            {s.text}
          </p>
        ) : (
          <ul key={s.id} className="list-disc ml-6">
            {s.bullets.map((b, i) => (
              <li key={`${s.id}-${i}`}>{b}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
