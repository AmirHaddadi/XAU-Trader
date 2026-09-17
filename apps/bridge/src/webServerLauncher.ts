import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "./log.js";

const log = createLogger("web-launcher");

// Only relevant inside a packaged build (see build/package-windows/build.mjs)
// — `pkg` sets `process.pkg` on the global `process` object, which is how a
// packaged binary tells itself apart from a plain `tsx src/index.ts` dev
// run. In dev, apps/web runs its own `next dev` (pnpm dev:web) instead, so
// this must not try to spawn anything.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Process {
      pkg?: unknown;
    }
  }
}

// Deployed layout (see build/package-windows/build.mjs):
//   <dir>/xautrader-bridge-{win,linux}[.exe]   <- process.execPath, this binary
//   <dir>/web/server.js                         <- Next.js standalone server
//   <dir>/node.exe | <dir>/node                 <- portable runtime for it
// Packaging Next.js's server through pkg itself proved fragile (dynamic
// route requires, native @next/swc binaries) — a portable Node runtime
// running the standalone output's real server.js, verified end-to-end
// under Wine during Phase D, is the solid alternative.
let webServerChild: ReturnType<typeof execFile> | undefined;

export function maybeSpawnWebServer(webPort: number): void {
  if (!process.pkg) return;

  const baseDir = dirname(process.execPath);
  const serverJs = join(baseDir, "web", "server.js");
  const nodeRuntime = join(baseDir, process.platform === "win32" ? "node.exe" : "node");

  if (!existsSync(serverJs) || !existsSync(nodeRuntime)) {
    log.warn(`web server files missing next to the executable (expected ${serverJs} + ${nodeRuntime}) — skipping`);
    return;
  }

  const child = execFile(
    nodeRuntime,
    [serverJs],
    { cwd: join(baseDir, "web"), env: { ...process.env, PORT: String(webPort), HOSTNAME: "127.0.0.1" } },
    (err) => {
      if (err && !err.killed) log.error("web server exited unexpectedly", err.message);
    },
  );
  child.unref();
  webServerChild = child;
  log.info(`spawned web server (pid ${child.pid}) on port ${webPort}`);
}

// Used by selfUpdate.ts right before this process exits to hand off to the
// installer — without this, the old web server child would keep holding
// its port after the new bridge process comes back up and tries to spawn
// its own (EADDRINUSE).
export function stopWebServer(): void {
  webServerChild?.kill();
  webServerChild = undefined;
}
