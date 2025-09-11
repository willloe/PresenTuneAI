import { useEffect, useMemo, useRef, useState } from "react";
import EditorPreview from "./EditorPreview";
import type { EditorBuildResponse } from "../lib/api";
import { useExport } from "../hooks/useExport";
import { usePhases } from "../hooks/usePhases";
import { openInGoogleSlides } from "../integrations/externalEditor";
import { ensureGoogleDriveToken } from "../integrations/oauth/google";
import { getConfig } from "../config";
import Celebrate from "./ui/Celebrate";

import { themeKeyToMeta, type ThemeMeta } from "../theme/meta";
import { THEMES, type ThemeKey } from "../theme/themes";
import Button from "./ui/Button";

type Props = {
  editorResp: EditorBuildResponse | null;
  onOpenWorkbench?: () => void;
};

/** Merge + hydrate ThemeMeta without duplicate object keys */
function ensureThemeMeta(metaIn: any, themeKey: ThemeKey | string): ThemeMeta {
  const safeKey: ThemeKey = (THEMES as any)[themeKey] ? (themeKey as ThemeKey) : "default";
  const base = themeKeyToMeta(safeKey);

  const inFonts = (metaIn?.fonts ?? {}) as Partial<ThemeMeta["fonts"]>;
  const inColors = (metaIn?.colors ?? {}) as Partial<ThemeMeta["colors"]>;

  // Start from base → override with incoming → then ensure sensible fallbacks
  let fonts: ThemeMeta["fonts"] = {
    ...(base.fonts || {}),
    ...(inFonts || {}),
  } as ThemeMeta["fonts"];
  fonts.heading ||= "Inter, ui-sans-serif, system-ui";
  fonts.body ||= "Inter, ui-sans-serif, system-ui";
  fonts.weightHeading ||= 700;
  fonts.weightBody ||= 400;
  if (fonts.letterSpacing === undefined) fonts.letterSpacing = "0em";

  let colors: ThemeMeta["colors"] = {
    ...(base.colors || {}),
    ...(inColors || {}),
  } as ThemeMeta["colors"];
  colors.appBg ||= "#0f172a";
  colors.surface ||= "#ffffff";
  colors.text ||= "#111827";
  colors.mutedText ||= "#6B7280";
  colors.border ||= "#E5E7EB";
  colors.accent ||= "#111827";
  colors.accentContrast ||= "#ffffff";
  colors.accentSoft ||= "#F3F4F6";

  return {
    ...base,
    ...(metaIn ?? {}),
    fonts,
    colors,
  };
}

export default function FinalizeSection({ editorResp, onOpenWorkbench }: Props) {
  const { setStep } = usePhases();
  const { ready, theme, exporting, exportErr, exportInfo, downloadUrl, lastExport, runExport } =
    useExport({ editorResp });
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState<null | "google">(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean>(true);

  // subtle ring + celebration when export becomes available
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (exportInfo) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 1300);
      return () => clearTimeout(t);
    }
  }, [exportInfo]);

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

  // Normalize editor + hydrate theme_meta with defaults
  const normalizedEditor = useMemo(() => {
    const ed = editorResp?.editor;
    if (!ed) return null;
    const safeKey: ThemeKey = (THEMES as any)[ed.theme] ? (ed.theme as ThemeKey) : "default";
    const safeMeta = ensureThemeMeta(ed.theme_meta, safeKey);
    return { ...ed, theme_meta: safeMeta };
  }, [editorResp?.editor]);

  const autoExportKey = useMemo(() => {
    const ed = normalizedEditor;
    if (!ed) return null;
    const ids = (ed.slides || []).map((s) => s.id || "").join(",");
    return `${theme}|${(ed.slides || []).length}|${ids}`;
  }, [normalizedEditor, theme]);

  const autoRanForKey = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || exporting || !autoExportKey) return;
    if (autoRanForKey.current === autoExportKey) return;
    autoRanForKey.current = autoExportKey;
    (async () => {
      try {
        await runExport();
      } catch {
        autoRanForKey.current = null;
      }
    })();
  }, [ready, exporting, autoExportKey, runExport]);

  const slidesCount = normalizedEditor?.slides?.length ?? 0;
  const statusLabel = useMemo(
    () => (ready ? `Editor: ✓ built ${slidesCount} slide${slidesCount === 1 ? "" : "s"}` : "Editor: not ready"),
    [ready, slidesCount]
  );

  function openWorkbenchStep() {
    setStep?.(3);
  }

  async function copyUrl(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  async function fetchExportBlob(url: string): Promise<Blob> {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`Download failed: ${r.status}`);
    return await r.blob();
  }
  async function getGoogleAccessToken(): Promise<string | null> {
    try {
      return await ensureGoogleDriveToken();
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  return (
    <div className="space-y-3">
      {/* celebration overlay – simple, respects reduced motion inside the component */}
      <Celebrate fire={celebrate} />

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
                onClick={openWorkbenchStep}
              >
                {editorResp.warnings.length} warning{editorResp.warnings.length === 1 ? "" : "s"} — Review in
                Workbench
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {normalizedEditor && (
            <Button
              variant="outline"
              onClick={onOpenWorkbench}
              title="Open the editor workbench"
              className="px-3 py-1"
            >
              Open Workbench
            </Button>
          )}
          <Button
            variant="solid"
            onClick={runExport}
            disabled={exporting || !ready}
            title={!ready ? "Build the editor doc first" : "Export deck"}
            className="px-4 py-2"
          >
            {exporting ? "Exporting…" : exportInfo ? "Re-export" : "Export"}
          </Button>
        </div>
      </div>

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
                <button className="underline underline-offset-2 hover:no-underline" onClick={openWorkbenchStep}>
                  Review in Workbench
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

      {normalizedEditor && (
        <div
          className={`themed-card p-3 anim-in ${celebrate ? "ring-2 ring-black/30" : ""}`}
          style={{ fontFamily: "var(--font-body)", letterSpacing: "var(--font-tracking)" }}
        >
          <EditorPreview
            doc={normalizedEditor}
            cols={2}
            minFontPx={12}
            showFrames={false}
            showImages={true}
            maxThumbH={220}
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {exportErr && (
          <>
            <span className="text-sm text-red-600">{exportErr}</span>
            <button className="text-sm underline underline-offset-2" onClick={openWorkbenchStep}>
              Rebuild in Workbench
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

            <Button
              variant="outline"
              size="xs"
              disabled={exporting || !lastExport.url}
              onClick={() => lastExport.url && copyUrl(lastExport.url)}
              title={exporting ? "Export in progress…" : "Copy download URL"}
            >
              {copied ? "Copied!" : "Copy URL"}
            </Button>

            <Button
              variant="outline"
              size="xs"
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
            </Button>
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
