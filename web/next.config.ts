import type { NextConfig } from "next";

const desktopBuild = process.env.KRIYAN_DESKTOP_BUILD === '1'

const nextConfig: NextConfig = {
  transpilePackages: ['@kriyan/client-core'],
  ...(desktopBuild
    ? {
        output: 'export' as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
