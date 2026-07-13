'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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

const RecreateConvexClientContext = createContext<(() => void) | null>(null)

export function useRecreateConvexClient(): () => void {
  const recreate = useContext(RecreateConvexClientContext)
  if (recreate === null) throw new Error('Convex client controls require ConvexClientProvider')
  return recreate
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!KRIYAN_CONFIG) return <ConfigurationRequired />
  return <ConfiguredProvider configuration={KRIYAN_CONFIG}>{children}</ConfiguredProvider>
}

function ConfiguredProvider({ children, configuration }: { children: ReactNode; configuration: KriyanWebConfiguration }) {
  const [clientState, setClientState] = useState(() => ({
    client: new ConvexReactClient(configuration.convexUrl),
    generation: 0,
  }))
  const activeClient = useRef(clientState.client)
  const recreate = useCallback((): void => {
    setClientState((current) => ({
      client: new ConvexReactClient(configuration.convexUrl),
      generation: current.generation + 1,
    }))
  }, [configuration.convexUrl])

  useEffect(() => {
    if (activeClient.current === clientState.client) return
    const replacedClient = activeClient.current
    activeClient.current = clientState.client
    void replacedClient.close()
  }, [clientState.client])

  return (
    <RecreateConvexClientContext.Provider value={recreate}>
      <ConvexProvider key={clientState.generation} client={clientState.client}>
        {children}
      </ConvexProvider>
    </RecreateConvexClientContext.Provider>
  )
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
