import type { NextConfig } from "next";

// The agent API lives on Convex. kriyan.app/api/v1/* forwards there unchanged (headers and body),
// so the CLI and the docs can use one address.
const convexSite = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Pages can't be framed or sniffed into another type, and send only the origin to other sites.
  // /mcp, /api and /.well-known are left alone: MCP clients and the agent API read them across
  // origins, with their own CORS headers.
  async headers() {
    return [
      {
        source: "/((?!mcp|api/|\\.well-known/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  // Addresses from the first version of Kriyan, so old links still land somewhere useful.
  async redirects() {
    return [
      {
        source: "/download",
        destination: "https://github.com/kausthubh-coder/kriyan/releases/latest",
        permanent: false,
      },
      { source: "/demo", destination: "https://app.kriyan.app", permanent: false },
      { source: "/app/:path*", destination: "https://app.kriyan.app/:path*", permanent: false },
    ];
  },
  async rewrites() {
    if (!convexSite) return [];
    return [
      { source: "/api/v1", destination: `${convexSite}/api/v1` },
      { source: "/api/v1/:op*", destination: `${convexSite}/api/v1/:op*` },
    ];
  },
};

export default nextConfig;
