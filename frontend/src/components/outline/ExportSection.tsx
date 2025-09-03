import type { ExportResp, ApiMeta } from "../../lib/api";
import { exportDownloadUrl } from "../../lib/api";
import Button from "../ui/Button";

export default function ExportSection({
  exporting,
  exportInfo,
  exportErr,
  onExport,
  meta,
  copyToClipboard,
}: {
  exporting: boolean;
  exportInfo: ExportResp | null;
  exportErr: string | null;
  onExport: () => void;
  meta: ApiMeta | null;
  copyToClipboard: (s: string) => Promise<void>;
}) {
  return (
    <div className="mt-4 space-y-3">
      <Button onClick={onExport} disabled={exporting} variant="solid">
        {exporting ? "Exporting…" : "Export"}
      </Button>

      {exportErr && (
        <p className="text-sm text-red-600">
          {exportErr}
          {meta?.requestId && (
            <span className="ml-2 inline-block rounded bg-red-50 text-red-700 px-2 py-0.5">
              req: {meta.requestId}
            </span>
          )}
        </p>
      )}

      {exportInfo && (
        <p className="text-sm text-gray-700 flex items-center gap-2 flex-wrap">
          <span>
            Exported <strong>.{exportInfo.format}</strong>
            {exportInfo.theme ? ` (theme: ${exportInfo.theme})` : ""} —{" "}
            {Math.max(1, Math.round(exportInfo.bytes / 1024))} KB
          </span>
          <code className="bg-gray-50 px-2 py-0.5 rounded">{exportInfo.path}</code>
          <Button
            size="xs"
            onClick={() => copyToClipboard(exportInfo.path)}
            title="Copy server path"
          >
            Copy
          </Button>
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
    </div>
  );
}
