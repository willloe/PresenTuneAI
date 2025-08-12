type Props = {
  health: "checking" | "ok" | "error";
  schemaVersion?: string | null;
  onOpenSettings: () => void;
};

export default function HeaderBar({ health, schemaVersion, onOpenSettings }: Props) {
  return (
    <header className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PresenTuneAI</h1>
          <p className="text-sm text-gray-600">
            API:{" "}
            <span className={health === "ok" ? "text-green-600" : "text-amber-600"}>
              {health === "checking" ? "checking..." : health}
            </span>
            {schemaVersion && (
              <span className="ml-2 inline-block rounded bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">
                schema v{schemaVersion}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-white"
          title="Open settings"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
