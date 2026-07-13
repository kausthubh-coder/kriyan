import { describe, expect, test } from 'bun:test'

import {
  canonicalContentHash,
  canonicalJson,
  deterministicAssistantMessageId,
  isWorkerOperation,
  WORKER_OPERATIONS,
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

  test('freezes unique worker operations and assistant identity', () => {
    expect(new Set(WORKER_OPERATIONS).size).toBe(WORKER_OPERATIONS.length)
    expect(WORKER_OPERATIONS.every(isWorkerOperation)).toBe(true)
    expect(deterministicAssistantMessageId('thread:1', 3))
      .toBe('message:thread:1:3:assistant')
  })
})
