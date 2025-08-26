import { useMemo, useState } from "react";
import EditorPreview from "./EditorPreview";
import type { EditorBuildResponse } from "../lib/api";
import { useExport } from "../hooks/useExport";
import { usePhases } from "../hooks/usePhases";

type Props = {
  editorResp: EditorBuildResponse | null;
};

export default function FinalizeSection({ editorResp }: Props) {
  const { setStep } = usePhases?.() ?? { setStep: undefined };
  const { ready, theme, exporting, exportErr, exportInfo, downloadUrl, lastExport, runExport } = useExport({ editorResp });
  const [copied, setCopied] = useState(false);

  const slidesCount = editorResp?.editor?.slides?.length ?? 0;
  const statusLabel = useMemo(() => (ready ? `Editor: ✓ built ${slidesCount} slide${slidesCount === 1 ? "" : "s"}` : "Editor: not ready"), [ready, slidesCount]);

  function rebuildEditor() {
    setStep?.(4);
  }

  async function copyUrl(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={ready ? "text-green-700" : "text-gray-700"}>{statusLabel}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-700">Theme: {theme}</span>
          {!!editorResp?.warnings?.length && (
            <>
              <span className="text-gray-400">•</span>
              <button className="text-amber-700 underline underline-offset-2 hover:no-underline" onClick={rebuildEditor}>
                {editorResp.warnings.length} warning{editorResp.warnings.length === 1 ? "" : "s"} — Review in Step 4
              </button>
            </>
          )}
        </div>

        <button
          onClick={runExport}
          disabled={exporting || !ready}
          className={`rounded-xl px-4 py-2 text-white ${exporting || !ready ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"}`}
          title={!ready ? "Build the editor doc first (Step 4)" : "Export deck"}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      {/* Build result/debug (kept) */}
      <div className="rounded-xl border p-3 bg-gray-50 text-sm">
        <div className="font-medium mb-1">Editor build result</div>
        {editorResp ? (
          <>
            <div>Slides: <b>{slidesCount}</b></div>
            {editorResp.warnings?.length ? (
              <div className="text-amber-700">
                Warnings: {editorResp.warnings.length} —{" "}
                <button className="underline underline-offset-2 hover:no-underline" onClick={rebuildEditor}>
                  Review in Step 4
                </button>
              </div>
            ) : (
              <div className="text-gray-600">No warnings</div>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer">View JSON</summary>
              <pre className="mt-2 max-h-80 overflow-auto">{JSON.stringify(editorResp, null, 2)}</pre>
            </details>
          </>
        ) : (
          <div className="text-gray-600">No editor doc yet. Go back one step and build it.</div>
        )}
      </div>

      {/* Optional visual preview */}
      {editorResp?.editor && (
        <EditorPreview
          doc={editorResp.editor}
          cols={2}
          minFontPx={12}
          showFrames={false}
          showImages={true}
          maxThumbH={220}
        />
      )}

      {/* Current export result (immediate) */}
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {exportErr && (
          <>
            <span className="text-sm text-red-600">{exportErr}</span>
            <button className="text-sm underline underline-offset-2" onClick={rebuildEditor}>
              Rebuild editor (Step 4)
            </button>
          </>
        )}

        {exportInfo && (
          <span className="text-sm text-gray-700">
            Exported <b>.{exportInfo.format}</b> • {prettyBytes(exportInfo.bytes)} —{" "}
            <a
              href={downloadUrl ?? "#"}
              className="underline"
              download
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (!downloadUrl) e.preventDefault();
              }}
            >
              Download file
            </a>
          </span>
        )}
      </div>

      {/* Latest successful export (persists across refresh) */}
      {lastExport && (
        <div className="rounded-xl border bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-gray-600">Latest export</span>
            <span className="text-xs text-gray-500">
              {lastExport.format.toUpperCase()} • {prettyBytes(lastExport.bytes)} • {timeAgo(lastExport.at)}
            </span>

            <a
              className="ml-auto inline-flex items-center text-xs rounded-md border px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              href={lastExport.url ?? "#"}
              rel="noreferrer"
              target="_blank"
              download
              onClick={(e) => {
                if (!lastExport.url) e.preventDefault();
              }}
            >
              Download
            </a>

            <button
              className="inline-flex items-center text-xs rounded-md border px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              disabled={!lastExport.url}
              onClick={() => lastExport.url && copyUrl(lastExport.url)}
              title="Copy download URL"
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function prettyBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

function timeAgo(ts: number): string {
  const delta = Date.now() - ts;
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
