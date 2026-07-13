const LIMITS = {
  id: 128,
  shortText: 256,
  input: 8_192,
  eventData: 16_384,
  error: 2_048,
  capabilities: 64,
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
