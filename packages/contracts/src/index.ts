/** The only version negotiated on Kriyan wire records introduced after d41. */
export const CONTRACT_VERSION = 'kriyan.contracts.v1' as const
export const LEGACY_PROTOCOL_VERSION = '1' as const
export const REMINDER_CAPABILITY = 'reminders' as const
export const AGENT_CHAT_CAPABILITY = 'agent.chat.v1' as const
export const ARTIFACT_MATERIALIZATION_CAPABILITY = 'artifact.materialization.v1' as const

export * from './canonical-vectors'
export * from './client-snapshot'
export * from './runtime-schema'
export * from './worker-operations'
export * from './worker-fixtures'
export * from './worker-results'

export const JOB_KINDS = Object.freeze({
  legacyCommand: 'command.v1',
  agentTurn: 'agent.turn.v1',
  artifactMaterialize: 'artifact.materialize.v1',
  artifactTombstone: 'artifact.tombstone.v1',
  memoryProject: 'memory.project.v1',
  memoryReconcile: 'memory.reconcile.v1',
  memoryCorrectionApply: 'memory.correction.apply.v1',
} as const)

export type JobKind = (typeof JOB_KINDS)[keyof typeof JOB_KINDS]

export const WORKER_OPERATIONS = Object.freeze([
  'node.register',
  'node.heartbeat',
  'command.read',
  'job.claim',
  'job.lease.renew',
  'run.start',
  'run.events.append',
  'effect.checkpoint',
  'session.checkpoint',
  'run.complete',
  'run.fail',
  'run.cancel',
  'thread.session.reset',
  'execution.context.read',
  'artifact.work.read',
  'note.version.read',
  'memory.work.read',
  'effect.task.commit',
  'effect.reminder.commit',
  'effect.note.commit',
  'effect.source.commit',
  'effect.knowledge.commit',
  'assistant.finalize',
  'artifact.materialization.complete',
  'artifact.materialization.fail',
  'artifact.materialization.tombstone',
  'memory.relation.upsert',
  'memory.provenance.upsert',
  'memory.cursor.advance',
  'memory.reconciliation.tombstone',
  'memory.correction.create',
  'memory.correction.apply',
  'memory.correction.restore',
  'memory.correction.conflict',
] as const)

export type WorkerOperation = (typeof WORKER_OPERATIONS)[number]

export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type AgentTurnState =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_for_node'
export type ProjectionState = 'pending' | 'projected' | 'failed' | 'tombstoned'
export type CorrectionAction = 'retract' | 'replace' | 'restore'
export type CorrectionState = 'pending' | 'applied' | 'restored' | 'conflict'

export interface WorkerJobContract {
  contractVersion?: typeof CONTRACT_VERSION
  kind?: JobKind
  requiredCapabilities?: string[]
  preferredNodeId?: string
  threadId?: string
  turnId?: string
  turnOrdinal?: number
  agentRevisionId?: string
  assistantMessageId?: string
  leaseToken?: string
}

export interface AgentSubmissionContract {
  installationId: string
  threadId: string
  commandId: string
  messageId: string
  idempotencyKey: string
  content: string
  maxAttempts: number
}

export interface WorkerOperationEnvelope<T = unknown> {
  contractVersion: typeof CONTRACT_VERSION
  operation: WorkerOperation
  input: T
  idempotencyKey?: string
}

export function isWorkerOperation(value: string): value is WorkerOperation {
  return (WORKER_OPERATIONS as readonly string[]).includes(value)
}

/** Stable JSON for hashes, idempotency comparisons, and deterministic fixtures. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => compareCanonicalKeys(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

/** Locale-independent UTF-16 code-unit order, matching ECMAScript relational comparison. */
export function compareCanonicalKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

/** Portable deterministic SHA-256 over canonical UTF-8 JSON. */
export function canonicalContentHash(contentJson: string): string {
  const bytes = [...new TextEncoder().encode(canonicalJson(JSON.parse(contentJson) as unknown))]
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let shift = 56; shift >= 0; shift -= 8) bytes.push(shift >= 32 ? 0 : (bitLength >>> shift) & 0xff)
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const words = new Array<number>(64)
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4
      words[index] = ((bytes[start]! << 24) | (bytes[start + 1]! << 16) | (bytes[start + 2]! << 8) | bytes[start + 3]!) >>> 0
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!
      const right = words[index - 2]!
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25)
      const choice = (e! & f!) ^ (~e! & g!)
      const temp1 = (h! + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22)
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const temp2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d! + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0]! + a!) >>> 0; hash[1] = (hash[1]! + b!) >>> 0
    hash[2] = (hash[2]! + c!) >>> 0; hash[3] = (hash[3]! + d!) >>> 0
    hash[4] = (hash[4]! + e!) >>> 0; hash[5] = (hash[5]! + f!) >>> 0
    hash[6] = (hash[6]! + g!) >>> 0; hash[7] = (hash[7]! + h!) >>> 0
  }
  return `sha256:${hash.map((word) => word.toString(16).padStart(8, '0')).join('')}`
}

export function deterministicTurnId(threadId: string, ordinal: number): string {
  return `turn:${threadId}:${ordinal}`
}

export function deterministicAssistantMessageId(threadId: string, ordinal: number): string {
  return `message:${threadId}:${ordinal}:assistant`
}
