import { API_BASE } from "./api";

export type ParsedPreview = {
  kind: "pdf" | "docx" | "text";
  pages: number;
  text: string;
  text_length: number;
  text_preview: string;
};

export type UploadResponse = {
  filename: string;
  size: number;
  content_type: string;
  path?: string | null;
  parsed: ParsedPreview;

  // NEW: optional uploadId (from response header)
  uploadId?: string;
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

  const json = (await res.json()) as Omit<UploadResponse, "uploadId">;
  const uploadId = res.headers.get("X-Upload-Id") ?? undefined;

  return { ...json, uploadId };
}
