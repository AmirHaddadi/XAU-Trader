import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase D packages this into a self-contained executable alongside the
  // bridge — standalone output ships the minimal server + deps as a plain
  // directory rather than requiring `next start` + node_modules on the
  // client machine. See the plan's packaging section.
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
