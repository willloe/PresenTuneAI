import type { ExportResp, ApiMeta } from "../lib/api";

type Props = {
  topic: string;
  setTopic: (s: string) => void;

  loading: boolean;
  onGenerate: () => Promise<void>;

  hasSlides: boolean;
  onOpenSettings: () => void;

  exporting: boolean;
  exportInfo: ExportResp | null;
  exportErr: string | null;
  onExport: () => Promise<void>;

  meta: ApiMeta | null;
  copyToClipboard: (s: string) => Promise<void>;
};

export default function OutlineControls({
  topic, setTopic,
  loading, onGenerate,
  hasSlides, onOpenSettings,
  exporting, exportInfo, exportErr, onExport,
  meta, copyToClipboard,
}: Props) {
  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <h2 className="text-lg font-medium mb-4">Generate Outline</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="sm:col-span-2">
          <span className="block text-sm mb-1">Topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
          />
        </label>
        <div className="text-sm text-gray-500 self-end">
          Slide count configured in{" "}
          <button
            onClick={onOpenSettings}
            className="underline underline-offset-2 hover:text-gray-700"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          onClick={onGenerate}
          disabled={loading}
          className={`rounded-xl px-4 py-2 text-white ${
            loading ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
          }`}
        >
          {loading ? "Generating…" : "Generate"}
        </button>

        {hasSlides && (
          <>
            <button
              onClick={onOpenSettings}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              title="Edit export theme, thumbnails, and slide count"
            >
              Settings…
            </button>

            <button
              onClick={onExport}
              disabled={exporting}
              className={`rounded-xl px-4 py-2 border ${
                exporting ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
            >
              {exporting ? "Exporting…" : `Export (.${exportInfo?.format ?? "txt"})`}
            </button>
          </>
        )}
      </div>

      {(exportErr) && (
        <p className="mt-3 text-sm text-red-600">{exportErr}</p>
      )}

      {meta?.serverTiming && (
        <p className="mt-2 text-xs text-gray-500">server-timing: {meta.serverTiming}</p>
      )}

      {exportInfo && (
        <p className="mt-3 text-sm text-gray-700 flex items-center gap-2 flex-wrap">
          <span>
            Exported <strong>.{exportInfo.format}</strong>
            {exportInfo.theme ? ` (theme: ${exportInfo.theme})` : ""} —
            {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB
          </span>
          <code className="bg-gray-50 px-2 py-0.5 rounded">{exportInfo.path}</code>
          <button
            onClick={() => copyToClipboard(exportInfo.path)}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            title="Copy path"
          >
            Copy
          </button>
        </p>
      )}
    </section>
  );
}
