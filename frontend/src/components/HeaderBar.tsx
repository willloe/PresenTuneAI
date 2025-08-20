import Tag, { type Tone } from "./ui/Tag";

type Props = {
  health: "checking" | "ok" | "error";
  schemaVersion?: string | null;
  onOpenSettings: () => void;
};

export default function HeaderBar({ health, schemaVersion, onOpenSettings }: Props) {
  const toneByHealth: Record<Props["health"], Tone> = {
    ok: "success",
    error: "danger",
    checking: "neutral",
  };

  const healthLabel =
    health === "checking" ? "checking…" : health === "ok" ? "ok" : "error";

  return (
    <header className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PresenTuneAI</h1>
          <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
            <span>API:</span>
            <Tag tone={toneByHealth[health]} size="xs">
              {healthLabel}
            </Tag>
            {schemaVersion && (
              <Tag tone="neutral" size="xs">
                schema v{schemaVersion}
              </Tag>
            )}
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-white"
          title="Open settings"
          type="button"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
