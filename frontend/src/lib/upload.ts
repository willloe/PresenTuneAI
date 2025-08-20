// frontend/src/lib/upload.ts
import { API_BASE } from "./api";

export type ParsedPreview = {
  kind: "pdf" | "docx" | "text";
  pages: number;
  text: string;         // full raw text
  text_length: number;
  text_preview: string; // ~1000 chars
};

export type UploadResponse = {
  filename: string;
  size: number;                 // bytes
  content_type: string;         // e.g., application/pdf
  path?: string | null;         // null in non-debug
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
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  return (await res.json()) as UploadResponse;
}
