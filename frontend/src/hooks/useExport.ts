import { useCallback, useEffect, useMemo, useState } from "react";
import { api, exportDownloadUrl, type ExportResp, type EditorBuildResponse } from "../lib/api";
import { loadLastExport, saveLastExport, type LastExportMeta } from "../lib/storage";

type Args = {
  editorResp: EditorBuildResponse | null;
};

export function useExport({ editorResp }: Args) {
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<ExportResp | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<LastExportMeta | null>(null);

  const ready = !!editorResp?.editor && Array.isArray(editorResp.editor.slides) && editorResp.editor.slides.length > 0;
  const theme = editorResp?.editor?.theme ?? lastExport?.theme ?? "default";

  useEffect(() => {
    setLastExport(loadLastExport());
  }, []);

  const runExport = useCallback(async () => {
    if (!ready || exporting) return;
    setExporting(true);
    setExportErr(null);
    try {
      // Use your existing API exactly
      const { data } = await api.exportEditor({
        editor: editorResp!.editor,
        theme: editorResp!.editor?.theme,
      });

      setExportInfo(data);
      const url = exportDownloadUrl(data.path);
      setDownloadUrl(url);

      const meta: LastExportMeta = {
        path: data.path,
        url,
        format: data.format,
        bytes: data.bytes,
        theme: data.theme ?? editorResp!.editor?.theme,
        at: Date.now(),
      };
      saveLastExport(meta);
      setLastExport(meta);
    } catch (err: any) {
      setExportErr(err?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }, [editorResp, ready, exporting]);

  return {
    // state
    ready,
    theme,
    exporting,
    exportErr,
    exportInfo,
    downloadUrl,
    lastExport,

    // actions
    runExport,
  };
}
