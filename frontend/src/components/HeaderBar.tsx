// components/HeaderBar.tsx
import * as React from "react";

type HealthStatus = "ok" | "checking" | "error";

type Props = {
  health: HealthStatus | null | undefined;
  schemaVersion?: string | null;
  onOpenSettings: () => void;
};

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 " +
        className
      }
    >
      {children}
    </span>
  );
}

export default function HeaderBar({
  health,
  schemaVersion,
  onOpenSettings,
}: Props) {
  const status: HealthStatus = health ?? "checking";
  const isOk = status === "ok";

  const statusPillClasses =
    status === "ok"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-700/10"
      : status === "checking"
      ? "bg-amber-100 text-amber-800 ring-amber-700/10"
      : "bg-rose-100 text-rose-800 ring-rose-700/10";

  const statusDotClass =
    "inline-block size-1.5 rounded-full " +
    (status === "ok"
      ? "bg-emerald-500"
      : status === "checking"
      ? "bg-amber-500"
      : "bg-rose-500");

  const schema = schemaVersion ?? "v1.1";

  return (
    <header
      className="mx-auto max-w-5xl px-6 pt-6 pb-4 flex items-center justify-between"
      // Scope header text to the app's foreground token so it's readable on dark/light themes.
      style={{ color: "var(--app-fg)" }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">PresenTuneAI</h1>

        <div className="flex items-center gap-2">
          <Pill className={statusPillClasses}>
            <span className={statusDotClass} />
            {isOk ? "ok" : status}
          </Pill>

          <Pill className="bg-slate-200 text-slate-800 ring-slate-700/10">
            schema {schema}
          </Pill>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className={
          "rounded-lg px-4 py-2 text-sm border transition-colors " +
          "text-[color:var(--app-fg)] " +
          "border-[color:var(--app-fg)]/20 " +
          "hover:bg-[color:var(--app-fg)]/8"
        }
      >
        Settings
      </button>
    </header>
  );
}
