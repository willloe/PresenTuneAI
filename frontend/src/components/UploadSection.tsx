import { useRef, useState } from "react";
import type { UploadResponse } from "../lib/upload";
import { useDropZone } from "../hooks/useDropZone";
import { useAssets } from "../hooks/useAssets";
import { M } from "./ui/Motion";

type Props = {
  uploadErr: string | null;
  uploadMeta: UploadResponse | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** NEW: when true we show an overlay + disable interactions */
  uploading?: boolean;
};

function Shimmer({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded"
      style={{ width, height, background: "linear-gradient(90deg,#eee,#f5f5f5,#eee)" }}
    />
  );
}

function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={["inline-block rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export default function UploadSection({ uploadErr, uploadMeta, onPick, uploading = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // After an upload, use the uploadId (from response header) to fetch extracted assets
  const uploadId = uploadMeta?.uploadId ?? null;
  const { items: assets, loading: assetsLoading, error: assetsError } = useAssets(uploadId);

  // Bridge dropped files to the existing onPick(e) handler via a tiny shim.
  const handleFiles = (files: FileList | File[]) => {
    if (uploading) return; // ignore drops while busy
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

  const assetsLabel = assetsLoading ? "…" : String(assets.length);

  return (
    <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
      <h2 className="text-lg font-medium mb-4">Upload</h2>

      {/* Click-to-browse + Drag-and-drop zone */}
      <div className="relative">
        <M.div
          {...zoneProps}
          whileHover={!uploading ? { scale: 1.002 } : undefined}
          className={[
            "rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
            uploading
              ? "border-gray-300 bg-gray-50 opacity-70 pointer-events-none cursor-not-allowed"
              : isDragging || hover
              ? "border-black bg-gray-50"
              : "border-gray-300 hover:bg-gray-50",
          ].join(" ")}
          onClick={() => {
            if (!uploading) inputRef.current?.click();
          }}
          role="button"
          tabIndex={uploading ? -1 : 0}
          onKeyDown={(e) => {
            if (!uploading && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
          }}
          aria-describedby={helpId}
          aria-busy={uploading}
          aria-disabled={uploading}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div className="text-sm font-medium">Drop a PDF/DOCX/TXT here</div>
          <div id={helpId} className="text-xs text-gray-500 mt-1">
            or click to browse
          </div>
        </M.div>

        {/* Busy overlay */}
        {uploading && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm text-gray-800">
              <Spinner />
              <span>Uploading & parsing…</span>
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={onPick}
        className="sr-only"
        disabled={uploading}
      />

      {uploadErr && <p className="mt-2 text-sm text-red-600">{uploadErr}</p>}

      {/* Small inline status while busy and before we have meta */}
      {!uploadMeta && uploading && (
        <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
          <Spinner size={14} />
          Starting extraction… this can take a moment for long PDFs.
        </div>
      )}

      {uploadMeta ? (
        <div className="mt-3 text-sm">
          <div className="font-medium">{uploadMeta.filename}</div>
          <div className="text-gray-600">
            {kb(uploadMeta.size)} • {uploadMeta.content_type} • type: {uploadMeta.parsed.kind} • pages: {pagesLabel} •
            assets {assetsLoading ? "…" : assetsLabel}
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
