import { describe, expect, test } from 'bun:test'

import {
  canonicalContentHash,
  canonicalJson,
  deterministicAssistantMessageId,
  isClientSnapshotWire,
  isWorkerOperation,
  WORKER_OPERATIONS,
  WORKER_OPERATION_SCHEMAS,
  WORKER_OPERATION_VALID_INPUTS,
  WORKER_OPERATION_RESULT_SCHEMAS,
  WORKER_OPERATION_VALID_RESULTS,
  CANONICAL_VECTORS,
} from './index'

describe('frozen contracts', () => {
  test('canonicalizes object keys and hashes TipTap JSON deterministically', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
    expect(canonicalContentHash('{"content":[],"type":"doc"}'))
      .toBe(canonicalContentHash('{"type":"doc","content":[]}'))
    expect(canonicalContentHash('{"type":"doc","content":[]}')).toBe(
      `sha256:${new Bun.CryptoHasher('sha256').update('{"content":[],"type":"doc"}').digest('hex')}`,
    )
  })

  test('matches the shared Unicode and SHA-boundary vector corpus', () => {
    for (const vector of CANONICAL_VECTORS) {
      expect(canonicalJson(vector.value), vector.name).toBe(vector.canonical)
      expect(canonicalContentHash(JSON.stringify(vector.value))).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  test('freezes unique worker operations and assistant identity', () => {
    expect(new Set(WORKER_OPERATIONS).size).toBe(WORKER_OPERATIONS.length)
    expect(WORKER_OPERATIONS.every(isWorkerOperation)).toBe(true)
    expect(deterministicAssistantMessageId('thread:1', 3))
      .toBe('message:thread:1:3:assistant')
  })

  test('accepts every frozen valid DTO and rejects extra or malformed fields', () => {
    for (const operation of WORKER_OPERATIONS) {
      expect(WORKER_OPERATION_SCHEMAS[operation].validate(WORKER_OPERATION_VALID_INPUTS[operation]), operation).toBe(true)
      expect(WORKER_OPERATION_SCHEMAS[operation].validate({ ...WORKER_OPERATION_VALID_INPUTS[operation], unexpected: true }), operation).toBe(false)
    }
    expect(WORKER_OPERATION_SCHEMAS['run.events.append'].validate({
      ...WORKER_OPERATION_VALID_INPUTS['run.events.append'],
      events: [{ eventId: 'event:bad', sequence: 0, type: 'status', data: '{}', unexpected: true }],
    })).toBe(false)
    expect(WORKER_OPERATION_SCHEMAS['memory.correction.create'].validate({
      ...WORKER_OPERATION_VALID_INPUTS['memory.correction.create'],
      action: 'delete',
    })).toBe(false)
  })

  test('accepts every frozen result DTO and rejects malformed transport results', () => {
    for (const operation of WORKER_OPERATIONS) {
      const valid = WORKER_OPERATION_VALID_RESULTS[operation]
      expect(WORKER_OPERATION_RESULT_SCHEMAS[operation]!.validate(valid), operation).toBe(true)
      expect(WORKER_OPERATION_RESULT_SCHEMAS[operation]!.validate({ ...valid as object, unexpected: true }), operation).toBe(false)
      expect(WORKER_OPERATION_RESULT_SCHEMAS[operation]!.validate('invalid-result'), operation).toBe(false)
    }
  })

  test('rejects malformed aggregate snapshot results at runtime', () => {
    const window = { limit: 100, returned: 0, truncated: false }
    const valid = {
      transactionRevision: 0,
      windows: {
        tasks: window, reminders: window, calendarEvents: window, notes: window,
        notificationIntents: window, sources: window, documents: window, artifacts: window,
        nodes: window, threads: window, messages: window, activity: window,
      },
      productivity: { tasks: [], reminders: [], calendarEvents: [], notes: [], notificationIntents: [] },
      agents: { threads: [], messages: [] },
      knowledge: { sources: [], documents: [], artifacts: [] },
      nodes: { items: [], activity: [] },
    }
    expect(isClientSnapshotWire(valid)).toBe(true)
    const rows = {
      tasks: { installationId: 'i', taskId: 't', idempotencyKey: 'k', title: 'T', tags: [], status: 'open', revision: 0, createdAt: 1, updatedAt: 1 },
      reminders: { installationId: 'i', reminderId: 'r', idempotencyKey: 'k', message: 'R', remindAt: 1, timezone: 'UTC', deliveryPolicy: 'normal', status: 'scheduled', scheduleKey: 's', fireCount: 0, revision: 0, createdAt: 1, updatedAt: 1 },
      calendarEvents: { installationId: 'i', calendarEventId: 'e', idempotencyKey: 'k', title: 'E', startAt: 1, endAt: 2, timezone: 'UTC', allDay: false, status: 'confirmed', revision: 0, createdAt: 1, updatedAt: 1 },
      notes: { installationId: 'i', noteId: 'n', idempotencyKey: 'k', contentJson: '{"type":"doc"}', plainTextPreview: '', wordCount: 0, tags: [], revision: 0, createdAt: 1, updatedAt: 1 },
      notificationIntents: { installationId: 'i', notificationIntentId: 'ni', reminderId: 'r', scheduledFor: 1, deliveryPolicy: 'normal', dedupeKey: 'd', lifecycle: 'queued', attempt: 0, escalationLevel: 0, revision: 0, createdAt: 1, updatedAt: 1 },
      sources: { installationId: 'i', sourceRefId: 's', idempotencyKey: 'k', kind: 'document', displayName: 'S', syncState: 'synced', indexState: 'indexed', provenanceIds: [], revision: 0, createdAt: 1, updatedAt: 1 },
      documents: { installationId: 'i', knowledgeDocumentId: 'd', idempotencyKey: 'k', kind: 'topic', title: 'D', summary: '', tags: [], sourceRefIds: [], provenanceIds: [], syncState: 'synced', indexState: 'indexed', revision: 0, createdAt: 1, updatedAt: 1 },
      artifacts: { installationId: 'i', artifactId: 'a', noteId: 'n', noteVersionId: 'v', slug: 'a', projectionState: 'pending', revision: 0, createdAt: 1, updatedAt: 1 },
      nodes: { installationId: 'i', nodeId: 'node', displayName: 'Node', capabilities: [], protocolVersion: '1', status: 'online', lastHeartbeatAt: 1, revision: 0, createdAt: 1, updatedAt: 1 },
      threads: { installationId: 'i', threadId: 'th', agentId: 'ag', agentRevisionId: 'ar', nextTurnOrdinal: 1, sessionRevision: 0, createdAt: 1, updatedAt: 1 },
      messages: { installationId: 'i', messageId: 'm', threadId: 'th', turnId: 'turn', turnOrdinal: 1, role: 'user', state: 'queued', content: 'x', origin: 'client', agentRevisionId: 'ar', createdAt: 1, updatedAt: 1 },
    } as const
    const vectors = [
      { root: 'productivity', key: 'tasks', row: rows.tasks },
      { root: 'productivity', key: 'reminders', row: rows.reminders },
      { root: 'productivity', key: 'calendarEvents', row: rows.calendarEvents },
      { root: 'productivity', key: 'notes', row: rows.notes },
      { root: 'productivity', key: 'notificationIntents', row: rows.notificationIntents },
      { root: 'knowledge', key: 'sources', row: rows.sources },
      { root: 'knowledge', key: 'documents', row: rows.documents },
      { root: 'knowledge', key: 'artifacts', row: rows.artifacts },
      { root: 'nodes', key: 'items', row: rows.nodes },
      { root: 'agents', key: 'threads', row: rows.threads },
      { root: 'agents', key: 'messages', row: rows.messages },
    ] as const
    for (const vector of vectors) {
      const candidate = structuredClone(valid) as any
      candidate[vector.root][vector.key] = [vector.row]
      expect(isClientSnapshotWire(candidate), `${vector.root}.${vector.key} canonical`).toBe(true)
      candidate[vector.root][vector.key] = [{ ...vector.row, unexpected: true }]
      expect(isClientSnapshotWire(candidate), `${vector.root}.${vector.key} extra`).toBe(false)
      const missing = { ...vector.row } as Record<string, unknown>
      delete missing[Object.keys(vector.row)[0]!]
      candidate[vector.root][vector.key] = [missing]
      expect(isClientSnapshotWire(candidate), `${vector.root}.${vector.key} missing`).toBe(false)
    }
    expect(isClientSnapshotWire({ ...valid, transactionRevision: '0' })).toBe(false)
    expect(isClientSnapshotWire({ ...valid, knowledge: { ...valid.knowledge, artifacts: [{}] } })).toBe(false)
    expect(isClientSnapshotWire({ ...valid, nodes: { items: [], activity: [{ command: null }] } })).toBe(false)
  })
})
