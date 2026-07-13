import { expect, test } from 'bun:test'

test('Expo live mode is subscription driven and writes do not trigger refresh polling', async () => {
  const repository = await Bun.file(new URL('../lib/convex-repository.ts', import.meta.url)).text()
  const store = await Bun.file(new URL('../lib/product-store.tsx', import.meta.url)).text()
  expect(repository).toContain("import { ConvexClient } from 'convex/browser'")
  expect(repository).toContain('client.onUpdate(api.read.clientSnapshot')
  expect(repository).toContain('getSnapshot: snapshots.getSnapshot')
  expect(repository).toContain('subscribe: snapshots.subscribe')
  expect(repository).toContain('unsubscribe()')
  expect(repository).not.toContain('ConvexHttpClient')
  expect(repository).not.toContain('setInterval(')
  expect(store).not.toContain('if (result.ok) await refresh()')
  expect(store).not.toContain('setInterval(')
})
