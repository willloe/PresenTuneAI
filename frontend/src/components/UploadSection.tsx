import { useRef, useState } from "react";
import type { UploadResponse } from "../lib/upload";
import { useDropZone } from "../hooks/useDropZone";
import { useAssets } from "../hooks/useAssets";
import { M } from "./ui/Motion";

type Props = {
  uploadErr: string | null;
  uploadMeta: UploadResponse | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function Shimmer({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded"
      style={{ width, height, background: "linear-gradient(90deg,#eee,#f5f5f5,#eee)" }}
    />
  );
}

export default function UploadSection({ uploadErr, uploadMeta, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // After an upload, use the uploadId (from response header) to fetch extracted assets
  const uploadId = uploadMeta?.uploadId ?? null;
  const { items: assets, loading: assetsLoading, error: assetsError } = useAssets(uploadId);

  // Bridge dropped files to the existing onPick(e) handler via a tiny shim.
  const handleFiles = (files: FileList | File[]) => {
    const synthetic = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>;
    onPick(synthetic);
  };
  const { isDragging, zoneProps } = useDropZone(handleFiles);

  const [hover, setHover] = useState(false);

  const inputId = "file-input";
  const helpId = "upload-help";
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

  // Pretty pages label: DOCX often cannot report pages -> show "n/a"
  const pagesLabel =
    uploadMeta?.parsed?.kind === "docx" && (uploadMeta.parsed.pages ?? 0) === 0
      ? "n/a"
      : String(uploadMeta?.parsed?.pages ?? 0);

  // Assets count comes from the assets API, not from parsed
  const assetsLabel = assetsLoading ? "…" : String(assets.length);

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <h2 className="text-lg font-medium mb-4">Upload</h2>

      {/* Click-to-browse + Drag-and-drop zone */}
      <M.div
        {...zoneProps}
        whileHover={{ scale: 1.002 }}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
          isDragging || hover ? "border-black bg-gray-50" : "border-gray-300 hover:bg-gray-50",
        ].join(" ")}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-describedby={helpId}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="text-sm font-medium">Drop a PDF/DOCX/TXT here</div>
        <div id={helpId} className="text-xs text-gray-500 mt-1">
          or click to browse
        </div>
      </M.div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={onPick}
        className="sr-only"
      />

      {uploadErr && <p className="mt-2 text-sm text-red-600">{uploadErr}</p>}

      {uploadMeta ? (
        <div className="mt-3 text-sm">
          <div className="font-medium">{uploadMeta.filename}</div>
          <div className="text-gray-600">
            {kb(uploadMeta.size)} • {uploadMeta.content_type} • type: {uploadMeta.parsed.kind} • pages: {pagesLabel} • assets{" "}
            {assetsLoading ? "…" : assetsLabel}
            {assetsError ? <span className="ml-2 text-red-600">(assets load failed)</span> : null}
          </div>

          {uploadMeta.parsed.text_preview ? (
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 border">
              {uploadMeta.parsed.text_preview}
            </pre>
          ) : (
            <div className="mt-2 flex gap-2 items-center">
              <Shimmer width={160} height={12} />
              <Shimmer width={80} height={12} />
              <Shimmer width={100} height={12} />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
