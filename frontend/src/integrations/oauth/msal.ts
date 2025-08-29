import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser";
import { getConfig } from "../../config";

const MS_SCOPES = ["Files.ReadWrite"]; // enough to upload to user's OneDrive

let msalApp: PublicClientApplication | null = null;

function pickAccount(app: PublicClientApplication): AccountInfo | null {
  return app.getAllAccounts()[0] ?? null;
}

async function getMsal(): Promise<PublicClientApplication> {
  if (msalApp) return msalApp;
  const { MSAL_CLIENT_ID, MSAL_TENANT = "common", MSAL_REDIRECT_URI = window.location.origin } = await getConfig();
  if (!MSAL_CLIENT_ID) throw new Error("Missing MSAL_CLIENT_ID in app-config.json");

  const cfg: Configuration = {
    auth: {
      clientId: MSAL_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${MSAL_TENANT}`,
      redirectUri: MSAL_REDIRECT_URI,
    },
    cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
  };

  msalApp = new PublicClientApplication(cfg);
  // Process redirect hash if any (popup flow rarely uses it, but safe)
  msalApp.handleRedirectPromise().catch(() => {});
  return msalApp;
}

/** Get a Microsoft Graph token with Files.ReadWrite. */
export async function ensureMsGraphToken(): Promise<string> {
  const app = await getMsal();
  let account = pickAccount(app);
  if (!account) {
    const login = await app.loginPopup({ scopes: MS_SCOPES });
    account = login.account!;
  }

  try {
    const silent = await app.acquireTokenSilent({ account, scopes: MS_SCOPES });
    return silent.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const interactive = await app.acquireTokenPopup({ account, scopes: MS_SCOPES });
      return interactive.accessToken;
    }
    throw e;
  }
}
