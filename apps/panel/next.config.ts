import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mototaxi/shared"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
