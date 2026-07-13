import { describe, expect, test } from 'bun:test'

import { isKriyanDemoMode, resolveKriyanConfiguration } from '@/lib/convex'
import { KRIYAN_SETTINGS_STORAGE_KEY, readStoredRuntimeSettings } from '@/lib/runtime-settings'

describe('web configuration', () => {
  test('fails closed without explicit deployment and installation configuration', () => {
    expect(resolveKriyanConfiguration({})).toBeNull()
    expect(resolveKriyanConfiguration({ NEXT_PUBLIC_CONVEX_URL: 'https://example.convex.cloud' })).toBeNull()
    expect(resolveKriyanConfiguration({
      NEXT_PUBLIC_CONVEX_URL: 'https://example.convex.cloud',
      NEXT_PUBLIC_KRIYAN_INSTALLATION_ID: 'installation:local-owner',
    })).toEqual({ convexUrl: 'https://example.convex.cloud', installationId: 'installation:local-owner' })
  })

  test('enables demo data only through the explicit public test seam', () => {
    expect(isKriyanDemoMode({})).toBe(false)
    expect(isKriyanDemoMode({ NEXT_PUBLIC_KRIYAN_DEMO: 'true' })).toBe(false)
    expect(isKriyanDemoMode({ NEXT_PUBLIC_KRIYAN_DEMO: '1' })).toBe(true)
  })

  test('loads and normalizes locally stored non-secret runtime preferences', () => {
    const storage = {
      getItem(key: string): string | null {
        expect(key).toBe(KRIYAN_SETTINGS_STORAGE_KEY)
        return JSON.stringify({
          convexUrl: ' https://owner.convex.cloud ',
          installationId: ' installation:desktop ',
          displayName: ' Home desktop ',
          demoMode: false,
        })
      },
    }

    expect(readStoredRuntimeSettings(storage)).toEqual({
      convexUrl: 'https://owner.convex.cloud',
      installationId: 'installation:desktop',
      displayName: 'Home desktop',
      demoMode: false,
    })
  })

  test('ignores malformed local preferences', () => {
    expect(readStoredRuntimeSettings({ getItem: () => '{nope' })).toBeNull()
  })
})
