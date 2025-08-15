// frontend/src/components/PhaseBar.tsx
type PhaseStatus = "done" | "active" | "upcoming";

export type Phase = {
  id: number;            // 1..5
  title: string;         // label
  status: PhaseStatus;   // done | active | upcoming
  hint?: string;         // optional small note
};

type Props = { phases: Phase[] };

export default function PhaseBar({ phases }: Props) {
  return (
    <nav aria-label="Workflow" className="mb-6">
      <ol className="flex flex-wrap items-center gap-3">
        {phases.map((p, i) => {
          const color =
            p.status === "done" ? "bg-green-600 text-white"
            : p.status === "active" ? "bg-black text-white"
            : "bg-gray-200 text-gray-700";
          return (
            <li key={p.id} className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${color}`}>
                <span className="font-semibold mr-1">{p.id}.</span> {p.title}
              </span>
              {p.hint && (
                <span className="text-xs text-gray-500">{p.hint}</span>
              )}
              {i < phases.length - 1 && (
                <span className="text-gray-300">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
