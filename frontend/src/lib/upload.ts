export type ParsedPreview = {
  kind: "pdf" | "docx" | "text";
  pages: number;
  text: string;         // full raw text
  text_length: number;
  text_preview: string; // ~1000 chars
};

export type UploadResponse = {
  filename: string;
  size: number;                       // bytes
  content_type: string;               // e.g., application/pdf
  path?: string | null;               // null in non-debug
  parsed: ParsedPreview;
};

export async function uploadFile(file: File): Promise<UploadResponse> {
  const base = (import.meta.env.VITE_API_BASE as string) ?? "http://localhost:8000/v1";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${base}/upload`, { method: "POST", body: fd });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ""}`);
  }
  return res.json() as Promise<UploadResponse>;
}
