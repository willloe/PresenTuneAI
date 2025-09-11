import { M } from "./ui/Motion";
import { useReducedMotion } from "framer-motion";

export type Phase = {
  id: number;
  title: string;
  status: "upcoming" | "active" | "done";
  hint?: string;
};

type Props = {
  phases: Phase[];
  onSelect?: (id: number) => void;
};

export default function PhaseBar({ phases, onSelect }: Props) {
  const prefersReduced = useReducedMotion();

  // Even spacing + progress width (done phases + partial for active)
  const total = phases.length;
  const doneCount = phases.filter(p => p.status === "done").length;
  const hasActive = phases.some(p => p.status === "active");
  // partial progress for the active step (looks nicer than snapping)
  const progressSteps = doneCount + (hasActive ? 0.5 : 0);
  const progressPct = Math.max(0, Math.min(100, (progressSteps / Math.max(1, total - 1)) * 100));

  return (
    <nav className="mb-4" aria-label="Progress">
      {/* Wrapper provides a single baseline and the animated progress on top */}
      <div className="relative pt-1 pb-2">
        {/* SINGLE base line */}
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: 0,
            height: 2,
            background: "var(--pb-track, #e5e7eb)" // gray-200
          }}
          aria-hidden
        />

        {/* Progress line drawn ON the same baseline */}
        <M.div
          style={{
            bottom: 0,
            height: 2,
            width: `${progressPct}%`,
            background:
              prefersReduced
                ? "currentColor"
                : "linear-gradient(90deg, #111 0%, #111 60%, rgba(17,17,17,.75) 100%)",
            color: "#111"
          }}
          className="absolute left-0"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ type: "spring", stiffness: 500, damping: 45 }}
          aria-hidden
        >
          {!prefersReduced && (
            <div
              className="h-full w-16"
              style={{
                marginLeft: "auto",
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,.6) 40%, transparent 100%)",
                filter: "blur(0.5px)",
                animation: "pbShimmer 1.3s linear infinite"
              }}
            />
          )}
        </M.div>

        {/* Pills: evenly spaced, no extra borders */}
        <ol className="grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0,1fr))`, gap: "0.75rem" }}>
          {phases.map((p, i) => {
          const isActive = p.status === "active";
          const isDone = p.status === "done";
          const base =
            isActive
              ? "bg-black text-white"
              : isDone
              ? "bg-gray-800 text-white/95"
              : "bg-gray-200 text-gray-800";

          const TagEl = onSelect ? "button" : ("div" as const);
          const justify = i === phases.length - 1 ? "justify-self-end" : "justify-self-start";

          return (
            <li key={p.id} className={justify}>
              <TagEl
                className={`rounded-full px-3 py-2 text-sm leading-none ${base} shadow-sm`}
                {...(onSelect
                  ? { onClick: () => onSelect?.(p.id), type: "button" }
                  : {})}
                {...(isActive ? { "aria-current": "step" } : {})}
                title={p.title}
              >
                <span className="font-medium tabular-nums">{p.id}.</span>{" "}
                <span className="font-medium">{p.title}</span>
                {/* {p.hint ? <span className="ml-2 opacity-80">{p.hint}</span> : null} */}
              </TagEl>
            </li>
          );
        })}
        </ol>
      </div>
    </nav>
  );
}

/* local keyframes (scoped by CSS-in-JS style attribute above) */
