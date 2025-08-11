export async function uploadFile(file: File) {
  const base = (import.meta.env.VITE_API_BASE as string) ?? "http://localhost:8000/v1";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${base}/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<{
    file_id: string; filename: string; size: number; content_type?: string;
    storage_path: string; parsed: { kind: string; pages: number; text_length: number; text_preview: string }
  }>;
}
