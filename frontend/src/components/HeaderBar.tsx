type Props = {
  health: "checking" | "ok" | "error";
  onOpenSettings: () => void;
};

export default function HeaderBar({ health, onOpenSettings }: Props) {
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
