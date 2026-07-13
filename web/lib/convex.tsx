'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { useState, type ReactNode } from 'react'

export interface KriyanWebConfiguration {
  convexUrl: string
  installationId: string
}

export function resolveKriyanConfiguration(environment: Record<string, string | undefined>): KriyanWebConfiguration | null {
  return environment.NEXT_PUBLIC_CONVEX_URL && environment.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID
    ? {
        convexUrl: environment.NEXT_PUBLIC_CONVEX_URL,
        installationId: environment.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID,
      }
    : null
}

export const KRIYAN_CONFIG = resolveKriyanConfiguration({
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  NEXT_PUBLIC_KRIYAN_INSTALLATION_ID: process.env.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID,
})

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!KRIYAN_CONFIG) return <ConfigurationRequired />
  return <ConfiguredProvider configuration={KRIYAN_CONFIG}>{children}</ConfiguredProvider>
}

function ConfiguredProvider({ children, configuration }: { children: ReactNode; configuration: KriyanWebConfiguration }) {
  const [client] = useState(() => new ConvexReactClient(configuration.convexUrl))
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

function ConfigurationRequired() {
  return (
    <main className="fatal-state" aria-labelledby="configuration-title">
      <div className="brand-mark">K</div>
      <h1 id="configuration-title">Connect this Kriyan installation</h1>
      <p>
        This client is not enrolled. Set <code>NEXT_PUBLIC_CONVEX_URL</code> and a unique
        <code>NEXT_PUBLIC_KRIYAN_INSTALLATION_ID</code> created by your local setup flow, then restart the web app.
      </p>
      <p>No shared installation or central Kriyan account is selected automatically.</p>
    </main>
  )
}
