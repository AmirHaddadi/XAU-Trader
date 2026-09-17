import { APP_VERSION } from "./version.js";

const REPO = "AmirHaddadi/XAU-Trader";
const REQUEST_TIMEOUT_MS = 5000;

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

// The repo, its release assets, and their download URLs are backend-only —
// stashed here after a check, consumed by selfUpdate.ts's applyUpdate(),
// never put on the wire to the browser (see UpdateCheckResult below and
// WsUpdateProgress in browser-protocol.ts). A client inspecting this app's
// own network traffic should see nothing beyond the local WebSocket.
let cachedRelease: GithubRelease | undefined;

// Manual-only by design (settings.request-style round trip, triggered by a
// button — see SettingsPanel.tsx) rather than an automatic startup/interval
// check: this app is connected to a live broker/order flow, so surprising a
// user with background network calls isn't appropriate here the way it
// might be for an ordinary web app.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "xau-trader-bridge" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) {
    // No release has been published yet — not an error, just nothing to
    // compare against.
    cachedRelease = undefined;
    return { currentVersion: APP_VERSION, latestVersion: APP_VERSION, hasUpdate: false };
  }
  if (!res.ok) throw new Error(`update check failed (${res.status})`);

  const data = (await res.json()) as GithubRelease;
  cachedRelease = data;
  const latestVersion = data.tag_name.replace(/^v/, "");
  return { currentVersion: APP_VERSION, latestVersion, hasUpdate: compareVersions(latestVersion, APP_VERSION) > 0 };
}

// Consumed by selfUpdate.ts. Only meaningful after checkForUpdate() has run
// in this same process lifetime — applyUpdate() surfaces a clear error if
// nothing's cached yet rather than silently no-op-ing.
export function getCachedReleaseAsset(namePattern: RegExp): GithubAsset | undefined {
  return cachedRelease?.assets.find((a) => namePattern.test(a.name));
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
