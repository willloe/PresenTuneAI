// Minimal helpers to open the latest export in Google Slides or PowerPoint Web.
// You provide OAuth access tokens via getGoogleAccessToken / getMsAccessToken.

export type GetToken = () => Promise<string | null>;

/** Cache uploads per artifact to avoid re-uploading on repeat clicks. */
const LS_KEY = "externalEditorCache"; // artifactKey -> { googleId?, msWebUrl? }
type Cache = Record<string, { googleId?: string; msWebUrl?: string }>;

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}
function writeCache(c: Cache) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {}
}

export async function openInGoogleSlides(opts: {
  blob: Blob;
  name?: string;
  artifactKey: string;              // e.g., exportInfo.path
  getGoogleAccessToken: GetToken;   // you provide this
  folderId?: string;                // optional Drive folder
}) {
  const { blob, artifactKey, getGoogleAccessToken, folderId } = opts;
  const name = (opts.name || "Deck").replace(/\.pptx?$/i, "") + ".pptx";

  const cache = readCache();
  const cachedId = cache[artifactKey]?.googleId;
  if (cachedId) {
    window.open(`https://docs.google.com/presentation/d/${cachedId}/edit`, "_blank", "noopener");
    return;
  }

  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Google not connected");

  // Drive multipart upload with conversion by specifying Google Slides mimeType in metadata.
  const metadata = {
    name: name.replace(/\.pptx$/i, ""), // Drive will create a Slides doc
    mimeType: "application/vnd.google-apps.presentation",
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob, name);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  if (!res.ok) throw new Error(`Google Drive upload failed: ${res.status}`);
  const file = (await res.json()) as { id: string };

  cache[artifactKey] = { ...(cache[artifactKey] || {}), googleId: file.id };
  writeCache(cache);

  window.open(`https://docs.google.com/presentation/d/${file.id}/edit`, "_blank", "noopener");
}

export async function openInPowerPointWeb(opts: {
  blob: Blob;
  name?: string;
  artifactKey: string;            // e.g., exportInfo.path
  getMsAccessToken: GetToken;     // you provide this
  folderPath?: string;            // default: /Presentations
}) {
  const { blob, artifactKey, getMsAccessToken } = opts;
  const folder = opts.folderPath || "/Presentations";
  const name = (opts.name && /\.pptx$/i.test(opts.name)) ? opts.name : `${opts.name || "Deck"}.pptx`;

  const cache = readCache();
  const cachedUrl = cache[artifactKey]?.msWebUrl;
  if (cachedUrl) {
    window.open(cachedUrl, "_blank", "noopener");
    return;
  }

  const token = await getMsAccessToken();
  if (!token) throw new Error("Microsoft not connected");

  // Simple upload (<=250MB). For bigger, switch to upload session.
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:${folder}/${encodeURIComponent(name)}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });
  if (!res.ok) throw new Error(`OneDrive upload failed: ${res.status}`);
  const item = (await res.json()) as { webUrl?: string };
  if (!item.webUrl) throw new Error("No webUrl returned");

  cache[artifactKey] = { ...(cache[artifactKey] || {}), msWebUrl: item.webUrl };
  writeCache(cache);

  window.open(item.webUrl, "_blank", "noopener");
}
