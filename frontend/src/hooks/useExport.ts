// frontend/src/hooks/useExport.ts
import { useCallback, useEffect, useState } from "react";
import {
  api,
  exportDownloadUrl,
  type ExportResp,
  type EditorBuildResponse,
} from "../lib/api";
import { loadLastExport, saveLastExport, type LastExportMeta } from "../lib/storage";
import { themeKeyToMeta, type ThemeMeta } from "../theme/meta";
import { THEMES, type ThemeKey } from "../theme/themes";

type Args = {
  editorResp: EditorBuildResponse | null;
};

export function useExport({ editorResp }: Args) {
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<LastExportMeta | null>(null);

  const ready =
    !!editorResp?.editor &&
    Array.isArray(editorResp.editor.slides) &&
    editorResp.editor.slides.length > 0;

  // Prefer editor theme; fall back to last export; then default
  const themeKey: ThemeKey =
    (editorResp?.editor?.theme as ThemeKey) ??
    ((lastExport?.theme as ThemeKey) || "default");

  useEffect(() => {
    setLastExport(loadLastExport());
  }, []);

  const runExport = useCallback(async () => {
    if (!ready || exporting) return;
    setExporting(true);
    setExportErr(null);
    try {
      // Build a full ThemeMeta from the selected key
      const resolvedKey: ThemeKey = (THEMES as any)[themeKey] ? themeKey : "default";
      const themeMeta: ThemeMeta = themeKeyToMeta(resolvedKey);

      const { data } = await api.exportDeck({
        editor: {
          ...(editorResp!.editor as any),
          theme_meta: editorResp!.editor?.theme_meta ?? themeMeta,
        },
        theme: resolvedKey,
      });

      setExportInfo(data);
      const url = exportDownloadUrl(data.path);
      setDownloadUrl(url);

      const meta: LastExportMeta = {
        path: data.path,
        url,
        format: data.format,
        bytes: data.bytes,
        theme: data.theme ?? resolvedKey,
        at: Date.now(),
      };
      saveLastExport(meta);
      setLastExport(meta);
    } catch (err: any) {
      setExportErr(err?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }, [editorResp, ready, exporting, themeKey]);

  return {
    // state
    ready,
    theme: themeKey,
    exporting,
    exportErr,
    exportInfo,
    downloadUrl,
    lastExport,

    // actions
    runExport,
  };
}
