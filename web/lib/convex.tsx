'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

export const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  'https://qualified-sandpiper-726.convex.cloud'

export const INSTALLATION_ID =
  process.env.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID ??
  'installation:oracle-reactive-web-20260712'

const convex = new ConvexReactClient(CONVEX_URL)

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}
