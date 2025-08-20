import EditorPreview from "./EditorPreview";
import type { ExportResp, EditorBuildResponse } from "../lib/api";

type Props = {
  editorResp: EditorBuildResponse | null;
  runExport: () => Promise<void>;
  exporting: boolean;
  exportErr: string | null;
  exportInfo: ExportResp | null;
  downloadUrl: string | null;
};

export default function FinalizeSection({
  editorResp,
  runExport,
  exporting,
  exportErr,
  exportInfo,
  downloadUrl,
}: Props) {
  return (
    <>
      <div className="rounded-xl border p-3 bg-gray-50 text-sm">
        <div className="font-medium mb-1">Editor build result</div>
        {editorResp ? (
          <>
            <div>Slides: <b>{editorResp.editor?.slides?.length ?? 0}</b></div>
            {editorResp.warnings?.length ? (
              <div className="text-amber-700">Warnings: {editorResp.warnings.length}</div>
            ) : (
              <div className="text-gray-600">No warnings</div>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer">View JSON</summary>
              <pre className="mt-2 max-h-80 overflow-auto">
                {JSON.stringify(editorResp, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <div className="text-gray-600">No editor doc yet. Go back one step and build it.</div>
        )}
      </div>

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

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={runExport}
          disabled={exporting || !editorResp?.editor}
          className={`rounded-xl px-4 py-2 text-white ${
            exporting || !editorResp?.editor
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-black hover:opacity-90"
          }`}
          title={!editorResp?.editor ? "Build the editor doc first" : "Export deck"}
        >
          {exporting ? "Exporting…" : "Export"}
        </button>

        {exportErr && <span className="text-sm text-red-600">{exportErr}</span>}

        {exportInfo && (
          <span className="text-sm text-gray-700">
            Exported <b>.{exportInfo.format}</b> • {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB —{" "}
            <a href={downloadUrl ?? "#"} className="underline" download target="_blank" rel="noreferrer">
              Download file
            </a>
          </span>
        )}
      </div>
    </>
  );
}
