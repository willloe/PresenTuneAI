import { useState } from "react";
import type { ExportResp, ApiMeta } from "../lib/api";
import { exportDownloadUrl } from "../lib/api";

type Props = {
  topic: string;
  setTopic: (s: string) => void;
  loading: boolean;
  onGenerate: () => void;

  hasSlides: boolean;
  onOpenSettings: () => void;

  exporting: boolean;
  exportInfo: ExportResp | null;
  exportErr: string | null;
  onExport: () => void;

  meta: ApiMeta | null;
  copyToClipboard: (s: string) => Promise<void>;
};

export default function OutlineControls({
  topic,
  setTopic,
  loading,
  onGenerate,
  hasSlides,
  onOpenSettings,
  exporting,
  exportInfo,
  exportErr,
  onExport,
  meta,
  copyToClipboard,
}: Props) {
  const [localTopic, setLocalTopic] = useState(topic);

  // keep parent topic in sync on blur (optional)
  const commitTopic = () => {
    if (localTopic !== topic) setTopic(localTopic);
  };

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Generate Outline</h2>
        <button
          onClick={onOpenSettings}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          title="Open settings"
        >
          Settings
        </button>
      </div>

      {/* Topic input */}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="block text-sm mb-1">Topic</span>
          <input
            value={localTopic}
            onChange={(e) => setLocalTopic(e.target.value)}
            onBlur={commitTopic}
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            placeholder="What’s this deck about?"
          />
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
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
          <button
            onClick={onExport}
            disabled={exporting}
            className={`rounded-xl px-4 py-2 border ${
              exporting ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
            }`}
            title="Export deck"
          >
            {exporting ? "Exporting…" : `Export`}
          </button>
        )}

        {/* Server timing (if present) */}
        {meta?.serverTiming && (
          <span className="text-xs text-gray-500">server-timing: {meta.serverTiming}</span>
        )}
      </div>

      {/* Errors */}
      {exportErr && (
        <p className="mt-3 text-sm text-red-600">
          {exportErr}
          {meta?.requestId && (
            <span className="ml-2 inline-block rounded bg-red-50 text-red-700 px-2 py-0.5">
              req: {meta.requestId}
            </span>
          )}
        </p>
      )}

      {/* Export result with Copy + Download */}
      {exportInfo && (
        <p className="mt-3 text-sm text-gray-700 flex items-center gap-2 flex-wrap">
          <span>
            Exported <strong>.{exportInfo.format}</strong>
            {exportInfo.theme ? ` (theme: ${exportInfo.theme})` : ""} —{" "}
            {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB
          </span>

          <code className="bg-gray-50 px-2 py-0.5 rounded">{exportInfo.path}</code>

          <button
            onClick={() => copyToClipboard(exportInfo.path)}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            title="Copy server path"
          >
            Copy
          </button>

          <a
            href={exportDownloadUrl(exportInfo.path)}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            title="Download file"
            download
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </p>
      )}
    </section>
  );
}
