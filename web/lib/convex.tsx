'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface ConvexClientControls {
  generation: number
  recreate: () => void
}

type ConvexClientFactory = (url: string) => ConvexReactClient

const DEFAULT_CLIENT_FACTORY: ConvexClientFactory = (url) => new ConvexReactClient(url)

const ConvexClientControlsContext = createContext<ConvexClientControls | null>(null)

export function useConvexClientControls(): ConvexClientControls {
  const controls = useContext(ConvexClientControlsContext)
  if (controls === null) throw new Error('Convex client controls require ConvexClientProvider')
  return controls
}

export function useRecreateConvexClient(): () => void {
  return useConvexClientControls().recreate
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!KRIYAN_CONFIG) return <ConfigurationRequired />
  return <ConfiguredProvider configuration={KRIYAN_CONFIG}>{children}</ConfiguredProvider>
}

export function ConfiguredProvider({
  children,
  configuration,
  createClient = DEFAULT_CLIENT_FACTORY,
}: {
  children: ReactNode
  configuration: KriyanWebConfiguration
  createClient?: ConvexClientFactory
}) {
  const [clientState, setClientState] = useState(() => ({
    client: createClient(configuration.convexUrl),
    generation: 0,
  }))
  const activeClient = useRef(clientState.client)
  const recreate = useCallback((): void => {
    setClientState((current) => ({
      client: createClient(configuration.convexUrl),
      generation: current.generation + 1,
    }))
  }, [configuration.convexUrl, createClient])

  useEffect(() => {
    if (activeClient.current === clientState.client) return
    const replacedClient = activeClient.current
    activeClient.current = clientState.client
    void replacedClient.close()
  }, [clientState.client])

  useEffect(() => () => {
    void activeClient.current.close()
  }, [])

  const controls = useMemo(() => ({
    generation: clientState.generation,
    recreate,
  }), [clientState.generation, recreate])

  return (
    <ConvexClientControlsContext.Provider value={controls}>
      <ConvexProvider client={clientState.client}>
        {children}
      </ConvexProvider>
    </ConvexClientControlsContext.Provider>
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
