import { expect, test } from 'bun:test'

import { minimalProductivityRegistry } from '../src'

test('capabilities prepare a deterministic effect before any external commit', async () => {
  const registry = minimalProductivityRegistry()
  const result = await registry.prepare(
    'create_reminder',
    { kind: 'reminder', message: 'practice', remindAt: 123, timezone: 'UTC' },
    {
      signal: new AbortController().signal,
      effectId: 'reminder:job:test',
      idempotencyKey: 'effect:job:test:reminder',
      linkage: {
        installationId: 'installation:test',
        commandId: 'command:test',
        jobId: 'job:test',
        runId: 'run:test',
        attempt: 1,
      },
    },
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      schemaVersion: 1,
      effectId: 'reminder:job:test',
      idempotencyKey: 'effect:job:test:reminder',
      type: 'reminder',
      phase: 'prepared',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      linkage: { jobId: 'job:test', runId: 'run:test', attempt: 1 },
    },
  })
})
