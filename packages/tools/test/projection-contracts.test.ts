import { expect, test } from 'bun:test'

import {
  isCitedRetrievalResult,
  minimalProductivityRegistry,
  type KnowledgeDocumentProjectionDto,
  type SourceRefProjectionDto,
} from '../src'

test('source and knowledge DTOs carry only compact projection fields', () => {
  const source = {
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
  } satisfies SourceRefProjectionDto
  const knowledge = {
    installationId: 'installation:test',
    knowledgeDocumentId: 'knowledge:test',
    idempotencyKey: 'knowledge-intent:test',
    kind: 'topic',
    title: 'Test topic',
    summary: 'A compact projection.',
    tags: ['test'],
    sourceRefIds: [source.sourceRefId],
    provenanceIds: source.provenanceIds,
    syncState: 'synced',
    indexState: 'indexed',
  } satisfies KnowledgeDocumentProjectionDto

  expect(knowledge.sourceRefIds).toEqual(['source:test'])
  expect(Object.keys(source)).not.toContain('body')
  expect(Object.keys(knowledge)).not.toContain('embedding')
})

test('cited retrieval validation rejects duplicate and unsafe payload fields', () => {
  const result = {
    resultId: 'retrieval:test',
    query: 'What is the test topic?',
    answer: 'It is a compact projection.',
    citations: [
      {
        citationId: 'citation:1',
        sourceRefId: 'source:test',
        knowledgeDocumentId: 'knowledge:test',
        displayName: 'Test document',
        sourceUrl: 'https://example.test/document',
        provenanceIds: ['capture:test'],
      },
    ],
    generatedAt: 123,
  }

  expect(isCitedRetrievalResult(result)).toBe(true)
  expect(
    isCitedRetrievalResult({ ...result, rawSourceBody: 'must stay local' }),
  ).toBe(false)
  expect(
    isCitedRetrievalResult({
      ...result,
      citations: [...result.citations, result.citations[0]],
    }),
  ).toBe(false)
})

test('projection DTO additions do not change durable reminder effect v1', () => {
  expect(minimalProductivityRegistry().names()).toEqual(['create_reminder'])
})
