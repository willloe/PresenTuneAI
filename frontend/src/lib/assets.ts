import { API_BASE } from "./api";

export type Asset = {
  id: string;
  filename: string;
  rel_path: string;
  width?: number;
  height?: number;
  ext?: string;
  checksum?: string;
  caption?: string | null;
};

export type AssetListResp = { items: Asset[]; count: number };

export async function listAssets(uploadId: string): Promise<Asset[]> {
  const base = String(API_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/assets?upload_id=${encodeURIComponent(uploadId)}`);
  if (!res.ok) throw new Error(`List assets failed: ${res.status}`);
  const data = (await res.json()) as AssetListResp;
  return data.items ?? [];
}

export function assetFileUrl(uploadId: string, assetId: string): string {
  const base = String(API_BASE).replace(/\/$/, "");
  return `${base}/assets/${assetId}/file?upload_id=${encodeURIComponent(uploadId)}`;
}
