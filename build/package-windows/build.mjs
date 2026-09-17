#!/usr/bin/env node
// One-click packaging pipeline. Produces build/package-windows/out/{win,linux}/,
// each a self-contained folder needing zero manually-installed Node/npm on
// the target machine.
//
// Every technique here was verified by actually running the output under
// Wine on the dev machine (the closest available proxy to the client's
// Windows PC) before being written into this script — see the git history
// for the incremental discovery, not assumed from documentation alone:
//
//  - Bridge: esbuild bundles apps/bridge to a single CJS file (pkg has
//    documented ESM resolution problems), then @yao-pkg/pkg packages it.
//    Cross-compiling the Windows target from this Linux host produces a
//    binary that *builds* fine but throws "V8 rejected the bytecode cache"
//    at runtime unless built with --public-packages "*" --public — found by
//    running the naive build under Wine, not from pkg's docs.
//  - Web: packaging Next.js's own server through pkg proved fragile
//    (dynamic route requires, native @next/swc binaries). Instead: `next
//    build`'s standalone output, with its traced node_modules *discarded*
//    and replaced by a fresh `npm install --omit=dev` of just the runtime
//    deps. Next's file-tracer copies real content out of pnpm's .pnpm
//    store but does not reliably reconstruct the symlinks that make it
//    resolvable (a documented pnpm+Next-standalone monorepo rough edge) —
//    a flat npm install sidesteps that class of bug entirely rather than
//    trying to out-guess the tracer.
//  - The web server itself runs on a downloaded, portable, official
//    nodejs.org build (not pkg — see above) shipped as a sibling file next
//    to the bridge exe; the bridge spawns it (see
//    apps/bridge/src/webServerLauncher.ts) so the EA only ever has one
//    spawn target (the bridge), matching the plan's "one process, one
//    launch button" design.

import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const BRIDGE_DIR = path.join(REPO_ROOT, "apps/bridge");
const WEB_DIR = path.join(REPO_ROOT, "apps/web");
const OUT_DIR = path.join(__dirname, "out");
const TMP_DIR = path.join(__dirname, ".tmp");

const NODE_VERSION = "22.20.0"; // pinned — verified end-to-end at this exact version, bump deliberately, not casually
const TARGETS = {
  win: { pkgTarget: "node22-win-x64", nodeAsset: "win-x64/node.exe", exeSuffix: ".exe", nodeName: "node.exe" },
  linux: { pkgTarget: "node22-linux-x64", nodeAsset: "linux-x64/node", exeSuffix: "", nodeName: "node" },
};

function run(cmd, cwd = REPO_ROOT) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function clean() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  for (const platform of Object.keys(TARGETS)) mkdirSync(path.join(OUT_DIR, platform), { recursive: true });
}

// ---- Bridge ----------------------------------------------------------

function buildBridge() {
  console.log("\n=== Bridge: esbuild bundle ===");
  const bundlePath = path.join(TMP_DIR, "bridge-bundle.cjs");
  run(
    `pnpm --filter @xau-trader/bridge exec esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=${bundlePath} --external:node:sqlite`,
    BRIDGE_DIR,
  );

  for (const [platform, t] of Object.entries(TARGETS)) {
    console.log(`\n=== Bridge: pkg (${platform}) ===`);
    const outFile = path.join(OUT_DIR, platform, `xautrader-bridge${t.exeSuffix}`);
    // --public-packages "*" --public: see the header comment — without
    // these, a cross-compiled Windows binary throws a V8 bytecode-cache
    // mismatch at runtime despite building without error.
    run(
      `pnpm --filter @xau-trader/bridge exec pkg ${bundlePath} --targets ${t.pkgTarget} --public-packages "*" --public --output ${outFile}`,
      BRIDGE_DIR,
    );
  }
}

// ---- Web --------------------------------------------------------------

function buildWeb() {
  console.log("\n=== Web: next build (standalone) ===");
  rmSync(path.join(WEB_DIR, ".next"), { recursive: true, force: true });
  run("pnpm --filter @xau-trader/web exec next build", WEB_DIR);

  const standaloneApp = path.join(WEB_DIR, ".next/standalone/apps/web");
  if (!existsSync(standaloneApp)) {
    throw new Error(`expected standalone output at ${standaloneApp} — did next.config.ts's output:"standalone" change?`);
  }

  // Static assets aren't included in the standalone trace by design (Next
  // docs) — copy them in manually.
  cpSync(path.join(WEB_DIR, ".next/static"), path.join(standaloneApp, ".next/static"), { recursive: true });

  // Discard the traced node_modules (pnpm-symlink-resolution issues — see
  // header comment) and replace the traced package.json with a minimal,
  // workspace-free one so a plain `npm install` can resolve it standalone.
  rmSync(path.join(standaloneApp, "node_modules"), { recursive: true, force: true });
  const srcPkg = JSON.parse(readFileSync(path.join(WEB_DIR, "package.json"), "utf8"));
  const runtimeDeps = { ...srcPkg.dependencies };
  delete runtimeDeps["@xau-trader/protocol"]; // type-only imports everywhere — erased at build time, not needed at runtime
  writeFileSync(
    path.join(standaloneApp, "package.json"),
    JSON.stringify({ name: srcPkg.name, private: true, version: srcPkg.version, dependencies: runtimeDeps }, null, 2),
  );

  console.log("\n=== Web: fresh npm install (flat, symlink-free) ===");
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: standaloneApp, stdio: "inherit" });

  for (const platform of Object.keys(TARGETS)) {
    const dest = path.join(OUT_DIR, platform, "web");
    cpSync(standaloneApp, dest, { recursive: true });
  }
}

// ---- Portable Node runtime (for the spawned web server only) ---------

function nodeDownloadUrl(platform) {
  const t = TARGETS[platform];
  const archiveExt = platform === "win" ? "zip" : "tar.xz";
  const archiveName = `node-v${NODE_VERSION}-${t.nodeAsset.split("/")[0]}`;
  return { url: `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}.${archiveExt}`, archiveName, archiveExt };
}

function fetchPortableNode(platform) {
  const t = TARGETS[platform];
  const destBinary = path.join(OUT_DIR, platform, t.nodeName);
  const cacheDir = path.join(TMP_DIR, "node-cache", platform);
  mkdirSync(cacheDir, { recursive: true });

  const { url, archiveName, archiveExt } = nodeDownloadUrl(platform);
  const archivePath = path.join(cacheDir, `${archiveName}.${archiveExt}`);

  console.log(`\n=== Portable Node runtime (${platform}) ===`);
  if (!existsSync(archivePath)) {
    run(`curl -sL -o "${archivePath}" "${url}"`, cacheDir);
  } else {
    console.log(`(using cached ${archivePath})`);
  }

  if (archiveExt === "zip") {
    run(`unzip -q -o "${archivePath}" -d "${cacheDir}"`, cacheDir);
    cpSync(path.join(cacheDir, archiveName, "node.exe"), destBinary);
  } else {
    run(`tar -xJf "${archivePath}" -C "${cacheDir}"`, cacheDir);
    cpSync(path.join(cacheDir, archiveName, "bin/node"), destBinary);
    execSync(`chmod +x "${destBinary}"`);
  }
}

// ---- Windows installer --------------------------------------------------

// One file to hand to the client instead of a folder — see project memory
// project_xau_trader_web_platform's self-update section for why (a
// کارفرما testing this shouldn't need to poke around inside a raw output
// folder, and it's also what apps/bridge/src/selfUpdate.ts's silent
// /S install targets). Linux has no installer step — that output stays a
// plain folder, since it's a dev/testing target here, not a real
// deployment target.
function buildInstaller(version) {
  console.log("\n=== Windows: NSIS installer ===");
  const nsiScript = path.join(__dirname, "installer.nsi");
  const srcDir = path.join(OUT_DIR, "win");
  const outFile = path.join(OUT_DIR, `XAUTrader-Setup-${version}.exe`);

  try {
    // -D, not /D: the Windows-style slash form is accepted by NSIS on
    // Windows but this Linux build (Ubuntu's `nsis` apt package, v3.10)
    // only recognizes the dash form — /D... was silently treated as a
    // positional argument (i.e. mistaken for the script path) instead of a
    // define, found by actually running this on the dev machine after
    // installing NSIS, not from docs alone.
    execFileSync("makensis", [`-DVERSION=${version}`, `-DSRCDIR=${srcDir}`, `-DOUTFILE=${outFile}`, nsiScript], {
      stdio: "inherit",
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(
        "\nmakensis not found — skipping installer build. Install NSIS (e.g. `sudo apt-get install -y nsis` on " +
          "this dev machine) and re-run `pnpm package` to produce the single-file Windows installer; the raw " +
          `${srcDir} folder is still usable on its own (copy it and run xautrader-bridge.exe directly).`,
      );
      return false;
    }
    throw err;
  }
  console.log(`Installer: ${outFile}`);
  return true;
}

// ---- Main ---------------------------------------------------------------

const rootPkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

clean();
buildBridge();
buildWeb();
for (const platform of Object.keys(TARGETS)) fetchPortableNode(platform);
const installerBuilt = buildInstaller(rootPkg.version);

console.log(`\nDone. Output in ${OUT_DIR}/`);
if (installerBuilt) console.log(`  XAUTrader-Setup-${rootPkg.version}.exe  <- hand this to a tester/client`);
console.log("  win/, linux/                             <- raw self-contained folders (dev use / no-installer platforms)");
