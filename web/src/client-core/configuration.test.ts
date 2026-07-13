import { describe, expect, test } from 'bun:test'

import { isKriyanDemoMode, resolveKriyanConfiguration } from '@/lib/convex'

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
})
