export type Phase = {
  id: number;
  title: string;
  status: "upcoming" | "active" | "done";
  hint?: string;
};

export default function PhaseBar({ phases }: { phases: Phase[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      {phases.map((p, i) => {
        const base =
          p.status === "active"
            ? "bg-black text-white"
            : p.status === "done"
            ? "bg-gray-900 text-white opacity-80"
            : "bg-gray-200 text-gray-700";
        return (
          <div key={p.id} className={`rounded-full px-3 py-1 ${base}`}>
            <span className="font-medium">
              {p.id}. {p.title}
            </span>
            {p.hint ? <span className="ml-2 opacity-80">{p.hint}</span> : null}
            {i < phases.length - 1 ? <span className="mx-2">→</span> : null}
          </div>
        );
      })}
    </nav>
  );
}
