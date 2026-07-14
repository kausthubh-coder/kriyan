import { expect, test } from 'bun:test'

import { minimalProductivityRegistry, productToolRegistry } from '../src'

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

test('product registry prepares all five deterministic effect families', async () => {
  const registry = productToolRegistry()
  expect(registry.names()).toEqual([
    'kriyan.knowledge', 'kriyan.note', 'kriyan.reminder', 'kriyan.source', 'kriyan.task',
  ])
  const fixtures = [
    ['kriyan.task', { action: 'create', taskId: 'task:1', title: 'Practice' }],
    ['kriyan.reminder', { action: 'create', reminderId: 'reminder:1', message: 'Practice', remindAt: 123, timezone: 'UTC' }],
    ['kriyan.note', { action: 'create', noteId: 'note:1', contentJson: '{"type":"doc"}' }],
    ['kriyan.source', { action: 'create', sourceRefId: 'source:1', displayName: 'Course' }],
    ['kriyan.knowledge', { action: 'create', knowledgeDocumentId: 'knowledge:1', title: 'Korean' }],
  ] as const
  for (const [name, input] of fixtures) {
    const result = await registry.prepare(name, input, {
      signal: new AbortController().signal,
      effectId: `effect:${name}`,
      idempotencyKey: `intent:${name}`,
      linkage: {
        installationId: 'installation:test', commandId: 'command:test',
        jobId: 'job:test', runId: 'run:test', attempt: 1,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({
      type: name.slice('kriyan.'.length),
      phase: 'prepared',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  }
})
