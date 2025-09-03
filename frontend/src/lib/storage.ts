// Persist the last successful export so it survives refreshes
export type LastExportMeta = {
  path: string;
  url: string;
  format: string;
  bytes: number;
  at: number;
  theme?: string;
};

const LS_KEY = "lastExport";

export function saveLastExport(meta: LastExportMeta) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(meta));
  } catch {}
}

export function loadLastExport(): LastExportMeta | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LastExportMeta) : null;
  } catch {
    return null;
  }
}
