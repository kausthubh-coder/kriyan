import { expect, test } from 'bun:test'

import { createExpoReactiveRepository } from '../../../mobile/lib/reactive-convex-adapter'
import { createWebReactiveRepository } from '../../../web/src/client-core/reactive-web-adapter'
import {
  createDeterministicSnapshotServer,
  EMPTY_CLIENT_SNAPSHOT,
} from './reactive-repository'

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('independent Web and Expo adapters converge through one atomic subscription transport', async () => {
  const server = createDeterministicSnapshotServer()
  const web = createWebReactiveRepository(server.connect())
  const expo = createExpoReactiveRepository(server.connect())
  let webNotifications = 0; let expoNotifications = 0
  const unsubscribeWeb = web.subscribe(() => { webNotifications += 1 })
  expo.subscribe(() => { expoNotifications += 1 })
  await flush()
  expect(server.activeConnections()).toBe(2)

  const actorAWrite = server.mutate(({ transactionRevision: _revision, ...current }) => ({
    ...current,
    productivity: {
      ...current.productivity,
      tasks: [{ taskId: 'task:one', title: 'One', status: 'open', revision: 1, createdAt: 1, updatedAt: 2 }],
      notes: [{ noteId: 'note:one', contentJson: '{"type":"doc"}', plainTextPreview: 'One', wordCount: 1, tags: [], revision: 1, createdAt: 1, updatedAt: 2 }],
    },
    agents: {
      threads: [{ threadId: 'thread:one', agentRevisionId: 'agent-revision:one' }],
      messages: [{ messageId: 'message:one', threadId: 'thread:one', turnOrdinal: 1, role: 'assistant', state: 'completed', content: 'Done' }],
    },
    knowledge: {
      sources: [],
      documents: [{ knowledgeDocumentId: 'knowledge:one', kind: 'topic', title: 'One', summary: 'Summary', tags: [], sourceRefIds: [], provenanceIds: [], syncState: 'synced', indexState: 'indexed', revision: 1, createdAt: 1, updatedAt: 2 }],
      artifacts: [{ artifactId: 'artifact:one', noteId: 'note:one', noteVersionId: 'version:one', slug: 'one', projectionState: 'projected', revision: 1, createdAt: 1, updatedAt: 2 }],
    },
    nodes: {
      items: [{ nodeId: 'node:one', displayName: 'Node', capabilities: ['agent.chat.v1'], status: 'online', lastHeartbeatAt: 2, revision: 1 }],
      activity: [{
        command: { commandId: 'command:one', input: 'turn', status: 'completed', revision: 1, createdAt: 1, updatedAt: 2 },
        job: { jobId: 'job:one', commandId: 'command:one', status: 'succeeded', attempt: 1, maxAttempts: 3, revision: 2, createdAt: 1, updatedAt: 2 },
        run: { runId: 'run:one', jobId: 'job:one', attempt: 1, nodeId: 'node:one', status: 'succeeded', revision: 1, startedAt: 1, finishedAt: 2 },
        state: 'completed', isFake: false,
      }],
    },
    connection: 'online',
  }))
  await flush()
  expect(actorAWrite.transactionRevision).toBe(1)
  expect(expo.getSnapshot()).toEqual(web.getSnapshot())
  expect(expo.getSnapshot()).toMatchObject({
    transactionRevision: 1,
    productivity: { tasks: [{ revision: 1 }], notes: [{ revision: 1 }] },
    agents: { messages: [{ state: 'completed' }] },
    knowledge: { documents: [{ revision: 1 }] },
    nodes: { items: [{ revision: 1 }], activity: [{ state: 'completed' }] },
  })
  expect([webNotifications, expoNotifications]).toEqual([2, 2])

  server.fail(new Error('offline'))
  await flush()
  expect(expo.getSnapshot()).toMatchObject({ transactionRevision: 1, connection: 'reconnecting', error: 'offline' })
  server.reconnect(); await flush()
  expect(expo.getSnapshot()).toMatchObject({ transactionRevision: 1, connection: 'online' })

  server.mutate(({ transactionRevision: _revision, ...current }) => ({
    ...current,
    productivity: { ...current.productivity, tasks: [...current.productivity.tasks, { taskId: 'task:newest', title: 'Newest', status: 'open', revision: 0, createdAt: 3, updatedAt: 3 }] },
  }))
  server.mutate(({ transactionRevision: _revision, ...current }) => ({
    ...current,
    productivity: { ...current.productivity, tasks: current.productivity.tasks.filter((task) => task.taskId !== 'task:newest') },
  }))
  server.fail(new Error('delete reconnect'))
  server.mutate(({ transactionRevision: _revision, ...current }) => ({
    ...current,
    productivity: { ...current.productivity, tasks: [] },
  }))
  server.reconnect(); await flush()
  expect(web.getSnapshot()).toMatchObject({ transactionRevision: 4, productivity: { tasks: [] }, connection: 'online' })
  expect(expo.getSnapshot()).toEqual(web.getSnapshot())

  unsubscribeWeb()
  web.dispose(); web.dispose()
  expect(server.activeConnections()).toBe(1)
  const before = webNotifications
  server.mutate(({ transactionRevision: _revision, ...current }) => ({ ...current, connection: 'online' }))
  await flush()
  expect(webNotifications).toBe(before)
  expo.dispose(); expo.dispose()
  expect(server.activeConnections()).toBe(0)
})

test('stores reject stale transaction snapshots and preserve last-confirmed state', async () => {
  const server = createDeterministicSnapshotServer({ ...EMPTY_CLIENT_SNAPSHOT, transactionRevision: 4, connection: 'online' })
  const expo = createExpoReactiveRepository(server.connect())
  await flush()
  server.fail(new Error('lost')); await flush()
  expect(expo.getSnapshot()).toMatchObject({ transactionRevision: 4, connection: 'reconnecting' })
  expo.dispose()
})
