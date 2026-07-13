import { expect, test } from 'bun:test'

import { minimalProductivityRegistry } from '../src'

test('capabilities prepare a deterministic effect before any external commit', async () => {
  const registry = minimalProductivityRegistry()
  const result = await registry.prepare(
    'create_reminder',
    { kind: 'reminder', message: 'practice', remindAt: 123, timezone: 'UTC' },
    { runId: 'run:test', signal: new AbortController().signal },
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      effectId: 'reminder:run:test',
      idempotencyKey: 'effect:run:test:reminder',
      kind: 'reminder',
    },
  })
})
