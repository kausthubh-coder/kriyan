import type { NextConfig } from "next";

// The agent API lives on Convex. kriyan.app/api/v1/* forwards there unchanged (headers and body),
// so the CLI and the docs can use one address.
const convexSite = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async rewrites() {
    if (!convexSite) return [];
    return [
      { source: "/api/v1", destination: `${convexSite}/api/v1` },
      { source: "/api/v1/:op*", destination: `${convexSite}/api/v1/:op*` },
    ];
  },
};

export default nextConfig;
