import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Phase D packages this into a self-contained executable alongside the
  // bridge — standalone output ships the minimal server + deps as a plain
  // directory rather than requiring `next start` + node_modules on the
  // client machine. See the plan's packaging section.
  output: "standalone",
  reactStrictMode: true,
  // In a pnpm workspace, Next's file tracer defaults to guessing the
  // monorepo root and can miss hoisted packages (@next/env, @swc/helpers)
  // if it guesses wrong — pointing it at the actual repo root explicitly
  // is the documented fix. Found by actually running the standalone
  // output under Wine (the closest proxy to the client's machine on this
  // dev box), not assumed from the docs alone.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
