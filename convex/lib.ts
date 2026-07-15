import { canonicalJson } from '@kriyan/contracts'

import type { MutationCtx } from './_generated/server'

const LIMITS = {
  id: 128,
  shortText: 256,
  input: 8_192,
  eventData: 16_384,
  error: 2_048,
  capabilities: 64,
  tags: 32,
  provenanceIds: 128,
  longText: 16_384,
  editorJson: 256_000,
} as const

export const NODE_HEARTBEAT_TIMEOUT_MS = 60_000
export const MAX_LEASE_DURATION_MS = 30_000
export const MAX_PAGE_SIZE = 100
export const MAX_EVENT_BATCH_SIZE = 32
export const MAX_EVENT_BATCH_DATA = 65_536

export function assertBoundedString(
  value: string,
  name: string,
  maxLength: number,
): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${name} must contain 1-${maxLength} characters`)
  }
}

export function assertId(value: string, name: string): void {
  assertBoundedString(value, name, LIMITS.id)
}

export function assertShortText(value: string, name: string): void {
  assertBoundedString(value, name, LIMITS.shortText)
}

export function assertLongText(value: string, name: string): void {
  assertBoundedString(value, name, LIMITS.longText)
}

export function assertOptionalId(value: string | undefined, name: string): void {
  if (value !== undefined) assertId(value, name)
}

export function assertStringList(
  values: string[],
  name: string,
  maximum: number = LIMITS.tags,
): void {
  if (values.length > maximum) {
    throw new Error(`${name} must contain at most ${maximum} values`)
  }
  for (const value of values) assertShortText(value, name)
  if (new Set(values).size !== values.length) {
    throw new Error(`${name} must not contain duplicates`)
  }
}

export function assertProvenanceIds(values: string[]): void {
  assertStringList(values, 'provenanceIds', LIMITS.provenanceIds)
}

export function assertSourceUrl(value: string | undefined): void {
  if (value === undefined) return
  assertBoundedString(value, 'sourceUrl', 2_048)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('sourceUrl must be an absolute HTTP(S) URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('sourceUrl must be an absolute HTTP(S) URL')
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function assertTipTapNode(value: unknown, depth: number): void {
  if (depth > 64 || !isPlainRecord(value) || typeof value.type !== 'string') {
    throw new Error('contentJson must contain a TipTap-compatible document')
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new Error('contentJson node content must be an array')
    }
    for (const child of value.content) assertTipTapNode(child, depth + 1)
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    throw new Error('contentJson node text must be a string')
  }
}

export function assertTipTapJson(value: string): void {
  if (value.length === 0 || value.length > LIMITS.editorJson) {
    throw new Error(
      `contentJson must contain 1-${LIMITS.editorJson} characters`,
    )
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    throw new Error('contentJson must be valid JSON')
  }
  assertTipTapNode(decoded, 0)
  if ((decoded as Record<string, unknown>).type !== 'doc') {
    throw new Error('contentJson root must be a TipTap doc node')
  }
}

export function assertInput(value: string): void {
  assertBoundedString(value, 'input', LIMITS.input)
}

export function assertEventData(value: string): void {
  if (value.length > LIMITS.eventData) {
    throw new Error(`data must contain at most ${LIMITS.eventData} characters`)
  }
}

export function assertError(value: string): void {
  assertBoundedString(value, 'error', LIMITS.error)
}

export function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite timestamp`)
  }
}

export function assertPositiveInteger(
  value: number,
  name: string,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
}

export function assertNonNegativeInteger(
  value: number,
  name: string,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 0 and ${maximum}`)
  }
}

export function assertExpectedRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('expectedRevision must be a non-negative safe integer')
  }
}

export function assertCapabilities(capabilities: string[]): void {
  if (capabilities.length > LIMITS.capabilities) {
    throw new Error(
      `capabilities must contain at most ${LIMITS.capabilities} values`,
    )
  }
  for (const capability of capabilities) {
    assertId(capability, 'capability')
  }
  if (new Set(capabilities).size !== capabilities.length) {
    throw new Error('capabilities must not contain duplicates')
  }
}

export function withoutSystemFields<
  Document extends { _id: unknown; _creationTime: number },
>(document: Document): Omit<Document, '_id' | '_creationTime'> {
  const {
    _id: _ignoredId,
    _creationTime: _ignoredCreationTime,
    ...value
  } = document
  return value
}

/** Same-transaction installation clock for every aggregate-visible mutation. */
export async function advanceClientSnapshotRevision(
  ctx: MutationCtx,
  installationId: string,
): Promise<number> {
  const installation = await ctx.db
    .query('installations')
    .withIndex('by_installation_id', (q) => q.eq('installationId', installationId))
    .unique()
  if (installation === null) throw new Error('installation not found')
  const snapshotRevision = (installation.snapshotRevision ?? 0) + 1
  await ctx.db.patch(installation._id, { snapshotRevision, updatedAt: Date.now() })
  return snapshotRevision
}
