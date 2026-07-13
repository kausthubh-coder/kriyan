import { afterEach, describe, expect, test } from 'bun:test'
import { act, useSyncExternalStore } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { Window } from 'happy-dom'

import { queuedActivityFixture, reminderFixture, taskFixture } from './fixtures'
import { ActivityRow, Brand, NodeSummary, PageHeader, ReminderRow, SectionHeading, TaskRow } from './today-app'

let hydratedRoot: Root | null = null

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
})

describe('Today presentational components', () => {
  test('renders task and reminder fixtures with native controls', () => {
    const task = renderToStaticMarkup(<TaskRow task={taskFixture} now={2_000} />)
    const reminder = renderToStaticMarkup(<ReminderRow reminder={reminderFixture} now={2_000} />)
    expect(task).toContain('Complete Practice Korean')
    expect(task).toContain('Practice Korean')
    expect(reminder).toContain('scheduled')
  })

  test('renders the queued state as queued rather than running', () => {
    const markup = renderToStaticMarkup(<ActivityRow item={queuedActivityFixture} now={2_000} onClick={() => {}} />)
    expect(markup).toContain('queued')
    expect(markup).not.toContain('running')
  })

  test('keeps a visible connection and node label in compact markup', () => {
    const markup = renderToStaticMarkup(<><Brand connectionMode="reconnecting" compact /><NodeSummary nodes={[]} liveNodes={[]} now={null} compact /></>)
    expect(markup).toContain('reconnecting')
    expect(markup).toContain('Offline')
    expect(markup).toContain('aria-live="polite"')
  })

  test('shows preview and loaded counts before Today slices its rows', () => {
    const markup = renderToStaticMarkup(<SectionHeading title="Next actions" href="/tasks" count="5 shown · 25 loaded" />)
    expect(markup).toContain('5 shown · 25 loaded')
    expect(markup).toContain('View all')
  })

  test('keeps View all targets at least 44px and renders one responsive activity tree', async () => {
    const css = await Bun.file(new URL('../../app/globals.css', import.meta.url)).text()
    const source = await Bun.file(new URL('./today-app.tsx', import.meta.url)).text()
    expect(css).toContain('.section-heading a { min-width: 44px; min-height: 44px;')
    expect(source.match(/<ActivityPanel/g)).toHaveLength(1)
    expect(source).not.toContain('mobile-activity')
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
})

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
