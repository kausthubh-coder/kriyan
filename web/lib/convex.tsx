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

import {
  configurationFromSettings,
  useRuntimeSettings,
  type KriyanWebConfiguration,
} from './runtime-settings'

export {
  isKriyanDemoMode,
  resolveKriyanConfiguration,
  type KriyanWebConfiguration,
} from './runtime-settings'

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
  const { hydrated, settings, saveSettings } = useRuntimeSettings()
  if (!hydrated) return <RuntimeLoading />
  if (settings.demoMode) return children
  const configuration = configurationFromSettings(settings)
  if (!configuration) return <ConfigurationRequired onUseDemo={() => saveSettings({ ...settings, demoMode: true })} />
  return (
    <ConfiguredProvider
      key={`${configuration.convexUrl}\n${configuration.installationId}`}
      configuration={configuration}
    >
      {children}
    </ConfiguredProvider>
  )
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

function RuntimeLoading() {
  return (
    <main className="fatal-state" aria-label="Loading Kriyan settings">
      <div className="brand-mark">K</div>
      <p>Loading this installation…</p>
    </main>
  )
}

function ConfigurationRequired({ onUseDemo }: { onUseDemo: () => void }) {
  const { settings, saveSettings } = useRuntimeSettings()
  const [convexUrl, setConvexUrl] = useState(settings.convexUrl)
  const [installationId, setInstallationId] = useState(settings.installationId)
  const [displayName, setDisplayName] = useState(settings.displayName)

  return (
    <main className="fatal-state" aria-labelledby="configuration-title">
      <div className="brand-mark">K</div>
      <h1 id="configuration-title">Connect this Kriyan installation</h1>
      <p>
        Enter the Convex deployment used by your Kriyan installation. Your private VPS node connects to the same
        Convex deployment to claim work and publish activity; this desktop app never connects directly to the node.
      </p>
      <form className="setup-form" onSubmit={(event) => {
        event.preventDefault()
        saveSettings({
          convexUrl,
          installationId,
          displayName,
          demoMode: false,
        })
      }}>
        <label><span>Convex deployment URL</span><input type="url" value={convexUrl} onChange={(event) => setConvexUrl(event.target.value)} placeholder="https://your-deployment.convex.cloud" required /></label>
        <label><span>Installation ID</span><input value={installationId} onChange={(event) => setInstallationId(event.target.value)} placeholder="installation:owner-device" required /></label>
        <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="My Kriyan" required /></label>
        <button className="primary-button" disabled={!convexUrl.trim() || !installationId.trim() || !displayName.trim()}>Connect through Convex</button>
      </form>
      <div className="setup-divider"><span>or verify without a network</span></div>
      <button className="quiet-button" onClick={onUseDemo}>Use the fully offline demo</button>
      <p className="settings-footnote">These non-secret preferences stay only in this app&apos;s local web storage. Kriyan does not select a shared installation or central account automatically.</p>
    </main>
  )
}
