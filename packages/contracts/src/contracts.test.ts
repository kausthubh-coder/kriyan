import { describe, expect, test } from 'bun:test'

import {
  canonicalContentHash,
  canonicalJson,
  deterministicAssistantMessageId,
  isWorkerOperation,
  WORKER_OPERATIONS,
  WORKER_OPERATION_SCHEMAS,
  WORKER_OPERATION_VALID_INPUTS,
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
})
