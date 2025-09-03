type AppConfig = {
  GOOGLE_CLIENT_ID?: string;
  MSAL_CLIENT_ID?: string;
  MSAL_TENANT?: string;        // "common" or your tenant id
  MSAL_REDIRECT_URI?: string;  // must be listed in Azure app Redirect URIs
};

let cfgPromise: Promise<AppConfig> | null = null;

export function getConfig(): Promise<AppConfig> {
  if (!cfgPromise) {
    cfgPromise = fetch("/app-config.json", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`config load failed: ${r.status}`);
      return r.json() as Promise<AppConfig>;
    });
  }
  return cfgPromise;
}
