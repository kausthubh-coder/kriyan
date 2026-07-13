import { CANONICAL_VECTORS, canonicalContentHash, canonicalJson } from '@kriyan/contracts'
import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { Window } from 'happy-dom'

import { ConvexClientProvider } from '../../lib/convex'
import { KRIYAN_SETTINGS_STORAGE_KEY, RuntimeSettingsProvider } from '../../lib/runtime-settings'

let root: Root | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
})

function Bomb(): React.ReactNode {
  return <output>live-convex-mounted</output>
}

describe('fresh-profile desktop setup gate', () => {
  test('renders deterministic loading markup during static export', () => {
    const first = renderToString(<RuntimeSettingsProvider><ConvexClientProvider><Bomb /></ConvexClientProvider></RuntimeSettingsProvider>)
    expect(first).toContain('Loading this installation')
    expect(first).not.toContain('live-convex-mounted')
    expect(renderToString(<RuntimeSettingsProvider><ConvexClientProvider><Bomb /></ConvexClientProvider></RuntimeSettingsProvider>)).toBe(first)
  })

  test('shows setup and a working demo escape before any live child mounts', async () => {
    const browser = new Window({ url: 'tauri://localhost/' })
    Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, Event: browser.Event, MouseEvent: browser.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true })
    browser.localStorage.removeItem(KRIYAN_SETTINGS_STORAGE_KEY)
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    root = createRoot(container as unknown as Element)
    await act(async () => { root?.render(<RuntimeSettingsProvider><ConvexClientProvider><Bomb /></ConvexClientProvider></RuntimeSettingsProvider>); await Promise.resolve() })
    expect(container.textContent).toContain('Connect this Kriyan installation')
    expect(container.textContent).toContain('Use the fully offline demo')
    expect(container.textContent).not.toContain('live-convex-mounted')
    const demo = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('offline demo'))
    await act(async () => { demo?.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })); await Promise.resolve() })
    expect(container.textContent).toContain('live-convex-mounted')
  })

  test('uses the shared portable canonical vectors in the Web runtime', () => {
    for (const vector of CANONICAL_VECTORS) {
      expect(canonicalJson(vector.value), vector.name).toBe(vector.canonical)
      expect(canonicalContentHash(JSON.stringify(vector.value))).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })
})
