import { getConfig } from "../../config";

const GSI_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let gsiLoaded = false;
let currentToken: { access_token: string; expiresAt: number } | null = null;

function loadScriptOnce(): Promise<void> {
  if (gsiLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_URL;
    s.async = true;
    s.onload = () => { gsiLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

function tokenFresh(): boolean {
  return !!(currentToken && Date.now() < currentToken.expiresAt - 60_000);
}

/** Get a Google Drive access token (Drive scope) via GIS token client. */
export async function ensureGoogleDriveToken(): Promise<string> {
  await loadScriptOnce();
  if (tokenFresh()) return currentToken!.access_token;

  const { GOOGLE_CLIENT_ID } = await getConfig();
  if (!GOOGLE_CLIENT_ID) throw new Error("Missing GOOGLE_CLIENT_ID in app-config.json");

  const google = (window as any).google as any;
  if (!google?.accounts?.oauth2?.initTokenClient) {
    throw new Error("Google Identity Services unavailable");
  }

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    prompt: "", // try silent; GIS will popup only if needed
    callback: () => {}, // set below per request
  });

  const token = await new Promise<string>((resolve, reject) => {
    tokenClient.callback = (resp: any) => {
      if (resp?.access_token) {
        const exp = Number(resp.expires_in || 3600);
        currentToken = { access_token: resp.access_token, expiresAt: Date.now() + exp * 1000 };
        resolve(resp.access_token);
      } else {
        reject(new Error(resp?.error || "Failed to get Google access token"));
      }
    };
    tokenClient.requestAccessToken();
  });

  return token;
}
