import { afterEach, describe, expect, test } from 'bun:test'
import type { ConvexReactClient } from 'convex/react'
import { act, useState, useSyncExternalStore } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { Window } from 'happy-dom'

import { ConfiguredProvider, useConvexClientControls } from '@/lib/convex'

import { queuedActivityFixture, reminderFixture, taskFixture } from './fixtures'
import { ActivityRow, Brand, handleComposerKeyDown, NodeSummary, PageHeader, ReminderRow, SectionHeading, TaskRow } from './today-app'

let hydratedRoot: Root | null = null

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
})

describe('Today presentational components', () => {
  test('renders task, reminder, and honest queued activity with native controls', () => {
    const task = renderToStaticMarkup(<TaskRow task={taskFixture} now={2_000} />)
    const reminder = renderToStaticMarkup(<ReminderRow reminder={reminderFixture} now={2_000} />)
    const activity = renderToStaticMarkup(<ActivityRow item={queuedActivityFixture} now={2_000} onClick={() => {}} />)
    expect(task).toContain('Complete Practice Korean')
    expect(task).toContain('Practice Korean')
    expect(reminder).toContain('scheduled')
    expect(activity).toContain('queued')
    expect(activity).not.toContain('running')
  })

  test('keeps compact status labels and Today preview counts visible', () => {
    const markup = renderToStaticMarkup(<><Brand connectionMode="reconnecting" compact /><NodeSummary nodes={[]} liveNodes={[]} now={null} compact /><SectionHeading title="Next actions" href="/tasks" count="5 shown · 25 loaded" /></>)
    expect(markup).toContain('reconnecting')
    expect(markup).toContain('Offline')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('5 shown · 25 loaded')
    expect(markup).toContain('View all')
  })

  test('keeps View all targets at least 44px and renders one responsive activity tree', async () => {
    const css = await Bun.file(new URL('../../app/globals.css', import.meta.url)).text()
    const source = await Bun.file(new URL('./today-app.tsx', import.meta.url)).text()
    expect(css).toContain('.section-heading a { min-width: 44px; min-height: 44px;')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) auto')
    expect(css).toContain('calc(var(--mobile-nav-height) + env(safe-area-inset-bottom) + var(--mobile-bottom-spacing))')
    expect(source.match(/<ActivityPanel/g)).toHaveLength(1)
    expect(source).not.toContain('mobile-activity')
  })

  test('submits only plain non-composing Enter and preserves native Shift Enter, Tab, and IME behavior', async () => {
    let submissions = 0
    let prevented = 0
    const submit = async (): Promise<void> => { submissions += 1 }
    const press = (overrides: Partial<Parameters<typeof handleComposerKeyDown>[0]>): void => {
      handleComposerKeyDown({
        key: 'Enter',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {},
        preventDefault: () => { prevented += 1 },
        ...overrides,
      }, submit)
    }

    press({})
    press({ shiftKey: true })
    press({ key: 'Tab' })
    press({ nativeEvent: { isComposing: true } })
    press({ nativeEvent: { keyCode: 229 } })
    await Promise.resolve()
    expect(submissions).toBe(1)
    expect(prevented).toBe(1)
  })

  test('hydrates deterministic date, connection, node, and relative-time markup without errors', async () => {
    const browser = new Window({ url: 'http://localhost/' })
    Object.assign(globalThis, {
      window: browser,
      document: browser.document,
      navigator: browser.navigator,
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
      IS_REACT_ACT_ENVIRONMENT: true,
    })
    const container = browser.document.createElement('div')
    container.innerHTML = renderToString(<HydrationSurface />)
    browser.document.body.append(container)
    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]): void => { errors.push(args) }
    try {
      await act(async () => {
        hydratedRoot = hydrateRoot(container as unknown as Element, <HydrationSurface />)
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    } finally {
      console.error = originalError
    }
    expect(errors).toEqual([])
    expect(container.textContent).toContain('Today')
    expect(container.textContent).toContain('connecting')
  })

  test('manual recreation preserves local state and disposes each replaced client generation', async () => {
    const browser = new Window({ url: 'http://localhost/' })
    Object.assign(globalThis, {
      window: browser,
      document: browser.document,
      navigator: browser.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    })
    const clients: Array<{ closeCalls: number; close: () => Promise<void> }> = []
    const createClient = (): ConvexReactClient => {
      const client = {
        closeCalls: 0,
        async close(): Promise<void> { client.closeCalls += 1 },
      }
      clients.push(client)
      return client as unknown as ConvexReactClient
    }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    await act(async () => {
      hydratedRoot = createRoot(container as unknown as Element)
      hydratedRoot.render(
        <ConfiguredProvider
          configuration={{ convexUrl: 'https://example.convex.cloud', installationId: 'installation:test' }}
          createClient={createClient}
        >
          <PreservedStateHarness />
        </ConfiguredProvider>,
      )
    })
    await act(async () => {
      ;(container.querySelector('[data-mutate]') as unknown as HTMLButtonElement | null)?.click()
      ;(container.querySelector('[data-recreate]') as unknown as HTMLButtonElement | null)?.click()
    })
    expect(container.textContent).toContain('draft survives|command:retained|stale row|optimistic task|pending mutation|generation 1')
    expect(clients).toHaveLength(2)
    expect(clients[0]?.closeCalls).toBe(1)
    expect(clients[1]?.closeCalls).toBe(0)
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
    expect(clients[1]?.closeCalls).toBe(1)
  })
})

function PreservedStateHarness() {
  const controls = useConvexClientControls()
  const [state, setState] = useState({
    composer: 'initial',
    selected: 'command:initial',
    rows: 'initial row',
    optimistic: 'initial optimistic',
    pending: 'initial pending',
  })
  return (
    <div>
      <button data-mutate onClick={() => setState({
        composer: 'draft survives',
        selected: 'command:retained',
        rows: 'stale row',
        optimistic: 'optimistic task',
        pending: 'pending mutation',
      })}>Mutate local state</button>
      <button data-recreate onClick={controls.recreate}>Recreate</button>
      <output>{Object.values(state).join('|')}|generation {controls.generation}</output>
    </div>
  )
}

function HydrationSurface() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const now = mounted ? 1_700_000_000_000 : null
  return (
    <div>
      <Brand connectionMode="connecting" compact />
      <PageHeader section="today" now={now} />
      <NodeSummary nodes={[]} liveNodes={[]} now={now} compact />
      <TaskRow task={taskFixture} now={now} />
      <ReminderRow reminder={reminderFixture} now={now} />
      <ActivityRow item={queuedActivityFixture} now={now} onClick={() => {}} />
    </div>
  )
}
