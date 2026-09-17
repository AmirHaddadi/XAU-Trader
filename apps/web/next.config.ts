import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Phase D packages this into a self-contained executable alongside the
  // bridge — standalone output ships the minimal server + deps as a plain
  // directory rather than requiring `next start` + node_modules on the
  // client machine. See the plan's packaging section.
  output: "standalone",
  reactStrictMode: true,
  // Next 16's dev server blocks cross-origin access to its own HMR socket
  // by default. The EA's Launch Platform button opens 127.0.0.1 URLs (not
  // localhost) even in dev — without this, opening the dev server via
  // 127.0.0.1 silently breaks the page (HMR socket refused, app looks
  // frozen). Only affects `next dev`; irrelevant to the packaged build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // In a pnpm workspace, Next's file tracer defaults to guessing the
  // monorepo root and can miss hoisted packages (@next/env, @swc/helpers)
  // if it guesses wrong — pointing it at the actual repo root explicitly
  // is the documented fix. Found by actually running the standalone
  // output under Wine (the closest proxy to the client's machine on this
  // dev box), not assumed from the docs alone.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
