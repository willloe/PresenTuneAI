import type { TextSection } from "../../types/deck";

export default function BlockViewer({ sections }: { sections: TextSection[] }) {
  if (!sections?.length) return null;

  return (
    <div className="space-y-2">
      {sections.map((s, i) =>
        s.kind === "paragraph" ? (
          <p
            key={s.id ?? i}
            className="text-sm text-gray-800 whitespace-pre-line"
          >
            {s.text}
          </p>
        ) : (
          <ul
            key={s.id ?? i}
            className="list-disc ml-5 text-sm text-gray-800 space-y-1"
          >
            {(s.bullets ?? []).map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
