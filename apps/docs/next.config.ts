import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { NextConfig } from 'next'

const appRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = dirname(dirname(appRoot))

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot,
  },
}

export default nextConfig
