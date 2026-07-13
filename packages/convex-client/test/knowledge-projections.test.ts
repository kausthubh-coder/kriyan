import { expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'

import {
  createKnowledgeProjectionPlane,
  type ProjectionUpsertResult,
} from '../src'

test('knowledge projection plane calls stable narrow Convex mutations', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const client = {
    async mutation(reference: unknown, input: unknown) {
      calls.push({
        name: getFunctionName(reference as never),
        input,
      })
      return {
        ok: true,
        created: calls.length === 1,
        revision: calls.length - 1,
      } satisfies ProjectionUpsertResult
    },
  }
  const plane = createKnowledgeProjectionPlane(client as never)

  expect(
    await plane.upsertSourceRef({
      installationId: 'installation:test',
      sourceRefId: 'source:test',
      idempotencyKey: 'source-intent:test',
      kind: 'document',
      displayName: 'Test document',
      sourceUrl: 'https://example.test/document',
      contentHash: 'sha256:test',
      syncState: 'synced',
      indexState: 'pending',
      provenanceIds: ['capture:test'],
      lastSyncedAt: 123,
    }),
  ).toEqual({ ok: true, created: true, revision: 0 })
  expect(
    await plane.upsertKnowledgeDocument({
      installationId: 'installation:test',
      knowledgeDocumentId: 'knowledge:test',
      idempotencyKey: 'knowledge-intent:test',
      kind: 'topic',
      title: 'Test topic',
      summary: 'A compact projection.',
      tags: ['test'],
      sourceRefIds: ['source:test'],
      provenanceIds: ['capture:test'],
      syncState: 'synced',
      indexState: 'indexed',
      expectedRevision: 0,
    }),
  ).toEqual({ ok: true, created: false, revision: 1 })

  expect(calls).toEqual([
    {
      name: 'knowledge:upsertSourceRef',
      input: expect.objectContaining({ sourceRefId: 'source:test' }),
    },
    {
      name: 'knowledge:upsertKnowledgeDocument',
      input: expect.objectContaining({
        knowledgeDocumentId: 'knowledge:test',
        expectedRevision: 0,
      }),
    },
  ])
})
