import { expect, test } from 'bun:test'

import { createReactiveSnapshotStore, EMPTY_CLIENT_SNAPSHOT } from './reactive-repository'

test('coalesces dependent snapshot notifications and disposes listeners', async () => {
  const store = createReactiveSnapshotStore()
  let notifications = 0
  store.subscribe(() => { notifications += 1 })
  store.replace({ ...EMPTY_CLIENT_SNAPSHOT, connection: 'online' })
  store.replace({ ...EMPTY_CLIENT_SNAPSHOT, connection: 'offline' })
  await Promise.resolve()
  expect(notifications).toBe(1)
  expect(store.getSnapshot().connection).toBe('offline')
  store.dispose()
  store.replace({ ...EMPTY_CLIENT_SNAPSHOT, connection: 'online' })
  await Promise.resolve()
  expect(notifications).toBe(1)
})

test('two independent clients converge on productivity, agent, knowledge, and node snapshots', async () => {
  const first = createReactiveSnapshotStore()
  const second = createReactiveSnapshotStore()
  let firstUpdates = 0; let secondUpdates = 0
  first.subscribe(() => { firstUpdates += 1 }); second.subscribe(() => { secondUpdates += 1 })
  const snapshot = {
    ...EMPTY_CLIENT_SNAPSHOT,
    productivity: {
      ...EMPTY_CLIENT_SNAPSHOT.productivity,
      tasks: [{ taskId: 'task:one', title: 'One', status: 'open' as const, revision: 0, createdAt: 1, updatedAt: 1 }],
      notes: [{ noteId: 'note:one', contentJson: '{"type":"doc"}', plainTextPreview: 'One', wordCount: 1, tags: [], revision: 0, createdAt: 1, updatedAt: 1 }],
    },
    agents: { threads: [{ threadId: 'thread:one', agentRevisionId: 'revision:one' }], messages: [] },
    knowledge: { sources: [], documents: [], artifacts: [{ artifactId: 'artifact:one', noteId: 'note:one', noteVersionId: 'version:one', slug: 'one', projectionState: 'pending' as const, revision: 0, createdAt: 1, updatedAt: 1 }] },
    nodes: { items: [{ nodeId: 'node:one', displayName: 'One', capabilities: ['agent.chat.v1'], status: 'online' as const, lastHeartbeatAt: 1, revision: 1 }], activity: [] },
    connection: 'online' as const,
  }
  first.replace(snapshot); second.replace(snapshot)
  await Promise.resolve()
  expect(first.getSnapshot()).toEqual(second.getSnapshot())
  expect([firstUpdates, secondUpdates]).toEqual([1, 1])
  first.dispose()
  second.replace({ ...snapshot, connection: 'reconnecting' })
  await Promise.resolve()
  expect([firstUpdates, secondUpdates]).toEqual([1, 2])
})
