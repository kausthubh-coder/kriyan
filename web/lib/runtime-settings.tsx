'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export interface KriyanWebConfiguration {
  convexUrl: string
  installationId: string
}

export interface KriyanRuntimeSettings extends KriyanWebConfiguration {
  displayName: string
  demoMode: boolean
}

interface RuntimeSettingsContextValue {
  hydrated: boolean
  settings: KriyanRuntimeSettings
  saveSettings: (settings: KriyanRuntimeSettings) => void
}

export const KRIYAN_SETTINGS_STORAGE_KEY = 'kriyan.runtime-settings.v1'

export function isKriyanDemoMode(environment: Record<string, string | undefined>): boolean {
  return environment.NEXT_PUBLIC_KRIYAN_DEMO === '1'
}

export function resolveKriyanConfiguration(environment: Record<string, string | undefined>): KriyanWebConfiguration | null {
  return environment.NEXT_PUBLIC_CONVEX_URL && environment.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID
    ? {
        convexUrl: environment.NEXT_PUBLIC_CONVEX_URL,
        installationId: environment.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID,
      }
    : null
}

const BUILD_CONFIGURATION = resolveKriyanConfiguration({
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  NEXT_PUBLIC_KRIYAN_INSTALLATION_ID: process.env.NEXT_PUBLIC_KRIYAN_INSTALLATION_ID,
})

export const BUILD_RUNTIME_SETTINGS: KriyanRuntimeSettings = {
  convexUrl: BUILD_CONFIGURATION?.convexUrl ?? '',
  installationId: BUILD_CONFIGURATION?.installationId ?? '',
  displayName: process.env.NEXT_PUBLIC_KRIYAN_DISPLAY_NAME?.trim() || 'My Kriyan',
  demoMode: isKriyanDemoMode({ NEXT_PUBLIC_KRIYAN_DEMO: process.env.NEXT_PUBLIC_KRIYAN_DEMO }),
}

function normalizeSettings(value: Partial<KriyanRuntimeSettings>): KriyanRuntimeSettings {
  return {
    convexUrl: typeof value.convexUrl === 'string' ? value.convexUrl.trim() : '',
    installationId: typeof value.installationId === 'string' ? value.installationId.trim() : '',
    displayName: typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : 'My Kriyan',
    demoMode: value.demoMode === true,
  }
}

export function readStoredRuntimeSettings(storage: Pick<Storage, 'getItem'>): KriyanRuntimeSettings | null {
  const serialized = storage.getItem(KRIYAN_SETTINGS_STORAGE_KEY)
  if (!serialized) return null
  try {
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object') return null
    return normalizeSettings(value as Partial<KriyanRuntimeSettings>)
  } catch {
    return null
  }
}

const RuntimeSettingsContext = createContext<RuntimeSettingsContextValue | null>(null)

const SETTINGS_CHANGED_EVENT = 'kriyan:runtime-settings-changed'

function subscribeSettings(listener: () => void): () => void {
  window.addEventListener('storage', listener)
  window.addEventListener(SETTINGS_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
  }
}

function settingsSnapshot(): string {
  return window.localStorage.getItem(KRIYAN_SETTINGS_STORAGE_KEY) ?? ''
}

function subscribeHydration(listener: () => void): () => void {
  queueMicrotask(listener)
  return () => undefined
}

export function RuntimeSettingsProvider({ children }: { children: ReactNode }) {
  const serialized = useSyncExternalStore(subscribeSettings, settingsSnapshot, () => '')
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false)
  const settings = useMemo(
    () => serialized
      ? readStoredRuntimeSettings({ getItem: () => serialized }) ?? BUILD_RUNTIME_SETTINGS
      : BUILD_RUNTIME_SETTINGS,
    [serialized],
  )

  const saveSettings = useCallback((next: KriyanRuntimeSettings): void => {
    const normalized = normalizeSettings(next)
    window.localStorage.setItem(KRIYAN_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }, [])

  const value = useMemo(
    () => ({ hydrated, settings, saveSettings }),
    [hydrated, saveSettings, settings],
  )

  return <RuntimeSettingsContext.Provider value={value}>{children}</RuntimeSettingsContext.Provider>
}

export function useRuntimeSettings(): RuntimeSettingsContextValue {
  const value = useContext(RuntimeSettingsContext)
  if (value === null) throw new Error('Runtime settings require RuntimeSettingsProvider')
  return value
}

export function configurationFromSettings(settings: KriyanRuntimeSettings): KriyanWebConfiguration | null {
  return settings.convexUrl && settings.installationId
    ? { convexUrl: settings.convexUrl, installationId: settings.installationId }
    : null
}
