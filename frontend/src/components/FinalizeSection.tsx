import { useEffect, useMemo, useState } from "react";
import EditorPreview from "./EditorPreview";
import type { EditorBuildResponse } from "../lib/api";
import { useExport } from "../hooks/useExport";
import { usePhases } from "../hooks/usePhases";
import { openInGoogleSlides } from "../integrations/externalEditor";
import { ensureGoogleDriveToken } from "../integrations/oauth/google";
import { getConfig } from "../config";

type Props = {
  editorResp: EditorBuildResponse | null;
};

export default function FinalizeSection({ editorResp }: Props) {
  const { setStep } = usePhases();
  const { ready, theme, exporting, exportErr, exportInfo, downloadUrl, lastExport, runExport } =
    useExport({ editorResp });
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState<null | "google">(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const { GOOGLE_CLIENT_ID } = await getConfig();
        setGoogleConfigured(!!GOOGLE_CLIENT_ID);
      } catch {
        setGoogleConfigured(false);
      }
    })();
  }, []);

  const slidesCount = editorResp?.editor?.slides?.length ?? 0;
  const statusLabel = useMemo(
    () => (ready ? `Editor: ✓ built ${slidesCount} slide${slidesCount === 1 ? "" : "s"}` : "Editor: not ready"),
    [ready, slidesCount]
  );

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

  // --- Google helper flow ---
  async function fetchExportBlob(url: string): Promise<Blob> {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`Download failed: ${r.status}`);
    return await r.blob();
  }
  async function getGoogleAccessToken(): Promise<string | null> {
    try {
      return await ensureGoogleDriveToken(); // scope: drive.file
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  // ---------------------------

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
              <button
                className="text-amber-700 underline underline-offset-2 hover:no-underline"
                onClick={rebuildEditor}
              >
                {editorResp.warnings.length} warning{editorResp.warnings.length === 1 ? "" : "s"} — Review in Step 4
              </button>
            </>
          )}
        </div>

        <button
          onClick={runExport}
          disabled={exporting || !ready}
          className={`rounded-xl px-4 py-2 text-white ${
            exporting || !ready ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90"
          }`}
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
            <div>
              Slides: <b>{slidesCount}</b>
            </div>
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

      {editorResp?.editor && (
        <div
          className="themed-card p-3 anim-in"
          style={{ fontFamily: "var(--font-body)", letterSpacing: "var(--font-tracking)" }}
        >
          <EditorPreview
            doc={editorResp.editor}
            cols={2}
            minFontPx={12}
            showFrames={false}
            showImages={true}
            maxThumbH={220}
          />
        </div>
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
              href={exporting ? "#" : (downloadUrl ?? "#")}
              className={`underline ${exporting ? "pointer-events-none opacity-50" : ""}`}
              download
              target="_blank"
              rel="noreferrer"
              aria-disabled={exporting || !downloadUrl}
              onClick={(e) => {
                if (exporting || !downloadUrl) e.preventDefault();
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
              className={`ml-auto inline-flex items-center text-xs rounded-md border px-2 py-1 hover:bg-gray-50 ${
                exporting ? "pointer-events-none opacity-50" : ""
              }`}
              href={exporting ? "#" : (lastExport.url ?? "#")}
              rel="noreferrer"
              target="_blank"
              download
              aria-disabled={exporting || !lastExport.url}
              onClick={(e) => {
                if (exporting || !lastExport.url) e.preventDefault();
              }}
              title={exporting ? "Export in progress…" : "Download"}
            >
              Download
            </a>

            <button
              className="inline-flex items-center text-xs rounded-md border px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              disabled={exporting || !lastExport.url}
              onClick={() => lastExport.url && copyUrl(lastExport.url)}
              title={exporting ? "Export in progress…" : "Copy download URL"}
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>

            {/* Open in Google Slides */}
            <button
              className="inline-flex items-center text-xs rounded-md border px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
              disabled={exporting || !lastExport.url || opening !== null || !googleConfigured}
              title={
                exporting
                  ? "Export in progress…"
                  : googleConfigured
                  ? "Upload and open in Google Slides"
                  : "Configure GOOGLE_CLIENT_ID in /app-config.json"
              }
              onClick={async () => {
                if (!lastExport.url || !lastExport.path) return;
                try {
                  setOpening("google");
                  const blob = await fetchExportBlob(lastExport.url);
                  await openInGoogleSlides({
                    blob,
                    name: "Deck.pptx",
                    artifactKey: lastExport.path,
                    getGoogleAccessToken,
                  });
                } catch (e) {
                  console.error(e);
                  alert((e as Error).message || "Google Slides open failed");
                } finally {
                  setOpening(null);
                }
              }}
            >
              {opening === "google" ? "Opening…" : "Open in Google Slides"}
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
