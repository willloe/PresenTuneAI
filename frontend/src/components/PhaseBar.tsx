export type Phase = {
  id: number;
  title: string;
  status: "upcoming" | "active" | "done";
  hint?: string;
};

type Props = {
  phases: Phase[];
  onSelect?: (id: number) => void; // optional navigation
};

export default function PhaseBar({ phases, onSelect }: Props) {
  return (
    <nav className="mb-4" aria-label="Progress">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {phases.map((p, i) => {
          const isActive = p.status === "active";
          const isDone = p.status === "done";
          const base =
            isActive
              ? "bg-black text-white"
              : isDone
              ? "bg-gray-900 text-white opacity-80"
              : "bg-gray-200 text-gray-700";

          const TagEl = onSelect ? "button" : "div";
          const common = `rounded-full px-3 py-1 ${base}`;

          return (
            <li key={p.id} className="flex items-center gap-2">
              <TagEl
                className={common}
                {...(onSelect
                  ? {
                      onClick: () => onSelect?.(p.id),
                      type: "button",
                    }
                  : {})}
                {...(isActive ? { "aria-current": "step" } : {})}
                title={p.title}
              >
                <span className="font-medium">{p.id}. {p.title}</span>
                {p.hint ? <span className="ml-2 opacity-80">{p.hint}</span> : null}
              </TagEl>

              {i < phases.length - 1 ? (
                <span className="text-gray-400" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
