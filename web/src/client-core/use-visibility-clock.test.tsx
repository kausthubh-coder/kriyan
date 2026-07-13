import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { Window } from 'happy-dom'

import { isNodeAvailable } from '@kriyan/client-core'

import { useVisibilityClock } from './use-visibility-clock'

let root: Root | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
})

function Clock({ heartbeat }: { heartbeat?: number }) {
  const now = useVisibilityClock(heartbeat === undefined ? [] : [heartbeat])
  const online = heartbeat !== undefined && now !== null && isNodeAvailable({ nodeId: 'node:1', displayName: 'Node', capabilities: [], status: 'online', lastHeartbeatAt: heartbeat, revision: 1 }, now)
  return <output data-now={now ?? 'ssr'}>{now === null ? 'ssr' : online ? 'Online' : 'Offline'}</output>
}

function mount(visibility: 'hidden' | 'visible', heartbeat?: number): HTMLElement {
  const browser = new Window({ url: 'http://localhost/' })
  Object.defineProperty(browser.document, 'visibilityState', { configurable: true, value: visibility })
  Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true })
  const container = browser.document.createElement('div')
  browser.document.body.append(container)
  root = createRoot(container as unknown as Element)
  act(() => root?.render(<Clock heartbeat={heartbeat} />))
  return container as unknown as HTMLElement
}

describe('visibility heartbeat clock', () => {
  test('samples immediately while hidden and keeps a fresh hidden node online', async () => {
    const heartbeat = Date.now()
    const container = mount('hidden', heartbeat)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
    expect(container.textContent).toBe('Online')
    expect(container.querySelector('output')?.dataset.now).not.toBe('ssr')
  })

  test('transitions stale at the 60-second boundary while hidden', async () => {
    const container = mount('hidden', Date.now() - 59_950)
    expect(container.textContent).toBe('Online')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    expect(container.textContent).toBe('Offline')
  })

  test('reschedules for a new heartbeat and recomputes on visibility restoration', async () => {
    const container = mount('hidden', Date.now() - 59_930)
    const before = Number(container.querySelector('output')?.dataset.now)
    await act(async () => {
      root?.render(<Clock heartbeat={Date.now()} />)
      await new Promise((resolve) => setTimeout(resolve, 90))
    })
    expect(container.textContent).toBe('Online')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); await new Promise((resolve) => setTimeout(resolve, 2)) })
    expect(Number(container.querySelector('output')?.dataset.now)).toBeGreaterThan(before)
  })

  test('preserves deterministic SSR markup with a null initial clock', () => {
    expect(renderToString(<Clock />)).toBe('<output data-now="ssr">ssr</output>')
    expect(renderToString(<Clock />)).toBe(renderToString(<Clock />))
  })
})
