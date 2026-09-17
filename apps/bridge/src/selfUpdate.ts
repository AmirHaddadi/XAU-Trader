import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpdateProgressStage } from "@xau-trader/protocol";
import { getCachedReleaseAsset } from "./updateCheck.js";
import { stopWebServer } from "./webServerLauncher.js";
import { createLogger } from "./log.js";

const log = createLogger("self-update");

// Must match the OutFile name build/package-windows/installer.nsi produces
// (see VERSION substitution there) — a released asset that doesn't match
// this pattern is treated as "no installer available" rather than guessed at.
const INSTALLER_NAME_PATTERN = /^XAUTrader-Setup-.*\.exe$/i;

// The real download -> silent-install -> restart, entirely inside this
// process. Nothing about the release asset's URL or the installed file
// layout is ever sent to the browser — onProgress only carries a generic
// stage name (see WsUpdateProgress in browser-protocol.ts), which is the
// whole point: a user inspecting this app's own network traffic in
// devtools sees the local WebSocket and nothing else.
//
// Only meaningful in a packaged build (process.pkg — same gating pattern as
// webServerLauncher.ts's maybeSpawnWebServer): dev mode has no installed
// layout and no installer to run.
//
// How the process-swap actually works, since nothing here is atomic:
// this process spawns the downloaded installer detached, then exits itself
// a moment later. Only once this exe's file handle is released can the
// installer's `File` instruction overwrite it — the installer's own final
// step (see installer.nsi) relaunches the new xautrader-bridge.exe once
// installed. This is the standard pattern for a Windows app replacing its
// own running executable; verified by reasoning from NSIS's documented
// silent-install (/S) behavior, not by an end-to-end run on real Windows
// (this dev machine only has Wine as a proxy) — treat the first real
// update as a real test, not a formality.
export async function applyUpdate(onProgress: (stage: UpdateProgressStage, message?: string) => void): Promise<void> {
  if (!process.pkg) throw new Error("update apply is only available in the installed app");

  const asset = getCachedReleaseAsset(INSTALLER_NAME_PATTERN);
  if (!asset) throw new Error("no update installer found — run a check first");

  onProgress("downloading");
  const res = await fetch(asset.browser_download_url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  const stageDir = join(tmpdir(), "xautrader-update");
  await mkdir(stageDir, { recursive: true });
  const installerPath = join(stageDir, asset.name);
  await writeFile(installerPath, buf);

  onProgress("installing");
  // /S = NSIS silent install, no UI. detached + unref so it survives this
  // process exiting right after.
  const child = spawn(installerPath, ["/S"], { detached: true, stdio: "ignore" });
  child.unref();

  onProgress("restarting");
  log.info("handing off to installer, exiting for update");
  stopWebServer();
  // A short delay, not zero — gives the "restarting" push a moment to
  // actually reach connected browsers before the socket drops, rather than
  // racing process.exit() against ws.send()'s underlying write.
  setTimeout(() => process.exit(0), 400);
}
