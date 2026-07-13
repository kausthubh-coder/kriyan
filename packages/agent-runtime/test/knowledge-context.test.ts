import { expect, test } from 'bun:test'

import { KnowledgeContextAssembler } from '../src'

test('retrieval hook assembles cited context without losing provenance', async () => {
  const assembler = new KnowledgeContextAssembler({
    async search(query, mode) {
      return {
        query,
        requestedMode: mode ?? 'lexical',
        effectiveMode: 'hybrid',
        results: [{
          documentId: 'entity:korean',
          relativePath: 'entities/projects/korean.md',
          documentType: 'entity',
          title: 'Korean',
          excerpt: 'Practice Korean vocabulary daily.',
          score: 1,
          retrieval: 'hybrid',
          citations: [{
            citationId: 'citation:korean',
            sourceRefId: 'source:korean',
            sourceVersion: 'commit:1',
            sourceLocation: '/temporary/source',
            vaultPath: 'transcripts/transcript-korean.md',
            contentHash: 'abc',
          }],
        }],
      }
    },
  })
  const context = await assembler.assemble('How should I study Korean?')
  expect(context.retrieval).toBe('hybrid')
  expect(context.text).toContain('[citation:korean] Korean')
  expect(context.citations.map((citation) => citation.citationId)).toEqual(['citation:korean'])
})
