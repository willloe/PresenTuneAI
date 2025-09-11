// lib/upload.ts
import { API_BASE } from "./api";

export type ParsedPreview = {
  kind: "pdf" | "docx" | "text";
  pages: number;
  text: string;
  text_length: number;
  text_preview: string;
};

export type UploadResponse = {
  uploadId?: string;
  filename: string;
  size: number;
  content_type: string;
  path?: string | null;
  parsed: ParsedPreview;
};

export async function uploadFile(file: File): Promise<UploadResponse> {
  const base = String(API_BASE).replace(/\/$/, "");
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${base}/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.clone().json();
      detail = (j?.detail as string) ?? JSON.stringify(j);
    } catch {
      try { detail = await res.text(); } catch {}
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  // ⬇️ parse JSON first; many browsers need Access-Control-Expose-Headers to read custom headers.
  const json = (await res.json()) as UploadResponse;
  const uploadIdFromJson = json.uploadId;
  const uploadIdFromHeader = res.headers.get("X-Upload-Id") ?? undefined;

  const uploadId = uploadIdFromJson ?? uploadIdFromHeader;
  if (!uploadId) {
    // Hard fail once so we don’t proceed to outline without it
    throw new Error("Upload succeeded but ‘uploadId’ is missing from response.");
  }

  return { ...json, uploadId };
}
