import { createHash } from 'node:crypto'

export type SourceProjectionKind =
  | 'audio'
  | 'video'
  | 'document'
  | 'web'
  | 'git'
  | 'calendar'
  | 'email'
  | 'chat'
  | 'other'

export type KnowledgeProjectionKind =
  | 'person'
  | 'project'
  | 'topic'
  | 'organization'
  | 'place'
  | 'event'
  | 'other'

export type ProjectionSyncState = 'pending' | 'synced' | 'failed' | 'stale'
export type ProjectionIndexState = 'pending' | 'indexed' | 'failed' | 'stale'

export interface SourceRefProjectionDto {
  installationId: string
  sourceRefId: string
  idempotencyKey: string
  kind: SourceProjectionKind
  displayName: string
  sourceUrl?: string
  externalId?: string
  contentHash?: string
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  provenanceIds: string[]
  lastSyncedAt?: number
  expectedRevision?: number
}

export interface KnowledgeDocumentProjectionDto {
  installationId: string
  knowledgeDocumentId: string
  idempotencyKey: string
  kind: KnowledgeProjectionKind
  title: string
  summary: string
  tags: string[]
  sourceRefIds: string[]
  provenanceIds: string[]
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  expectedRevision?: number
}

export interface CitedRetrievalCitation {
  citationId: string
  sourceRefId: string
  knowledgeDocumentId?: string
  displayName: string
  sourceUrl?: string
  provenanceIds: string[]
}

export interface CitedRetrievalResult {
  resultId: string
  query: string
  answer: string
  citations: CitedRetrievalCitation[]
  generatedAt: number
}

const CITED_RESULT_KEYS = new Set([
  'resultId',
  'query',
  'answer',
  'citations',
  'generatedAt',
])
const CITATION_KEYS = new Set([
  'citationId',
  'sourceRefId',
  'knowledgeDocumentId',
  'displayName',
  'sourceUrl',
  'provenanceIds',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isOptionalHttpUrl(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isCitedRetrievalCitation(
  value: unknown,
): value is CitedRetrievalCitation {
  if (!isRecord(value) || !hasOnlyKeys(value, CITATION_KEYS)) return false
  return (
    isNonEmptyString(value.citationId) &&
    isNonEmptyString(value.sourceRefId) &&
    (value.knowledgeDocumentId === undefined ||
      isNonEmptyString(value.knowledgeDocumentId)) &&
    isNonEmptyString(value.displayName) &&
    isOptionalHttpUrl(value.sourceUrl) &&
    isStringArray(value.provenanceIds) &&
    new Set(value.provenanceIds).size === value.provenanceIds.length
  )
}

/**
 * Accepts only the compact citation projection intended for Convex publication.
 * Unknown fields are rejected so raw bodies, excerpts, paths, and credentials
 * cannot accidentally hitch a ride in this shared result envelope.
 */
export function isCitedRetrievalResult(
  value: unknown,
): value is CitedRetrievalResult {
  if (!isRecord(value) || !hasOnlyKeys(value, CITED_RESULT_KEYS)) return false
  if (
    !isNonEmptyString(value.resultId) ||
    !isNonEmptyString(value.query) ||
    typeof value.answer !== 'string' ||
    !Number.isFinite(value.generatedAt) ||
    !Array.isArray(value.citations) ||
    !value.citations.every(isCitedRetrievalCitation)
  ) {
    return false
  }
  const citationIds = value.citations.map((citation) => citation.citationId)
  return new Set(citationIds).size === citationIds.length
}

export interface ReminderProduct {
  kind: 'reminder'
  message: string
  remindAt: number
  timezone: string
}

export interface EffectLinkage {
  installationId: string
  commandId: string
  jobId: string
  runId: string
  attempt: number
}

export type EffectPhase = 'prepared' | 'committing' | 'committed'

export interface PreparedEffect<T = unknown> {
  schemaVersion: 1
  effectId: string
  idempotencyKey: string
  type: 'reminder'
  payload: T
  payloadHash: string
  phase: EffectPhase
  linkage: EffectLinkage
}

export interface EffectCommitter {
  createReminder(input: {
    installationId: string
    reminderId: string
    idempotencyKey: string
    message: string
    remindAt: number
    timezone: string
  }): Promise<{ created: boolean }>
}

export interface ToolContext {
  signal: AbortSignal
  effectId: string
  idempotencyKey: string
  linkage: EffectLinkage
  committer?: EffectCommitter
}

export interface StructuredToolResult<T = unknown> {
  ok: boolean
  value?: T
  error?: { code: string; message: string; retryable: boolean }
}

export interface CapabilityTool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly effectType: PreparedEffect<TOutput>['type']
  prepare(
    input: TInput,
    context: ToolContext,
  ): Promise<StructuredToolResult<PreparedEffect<TOutput>>>
  commit(
    effect: PreparedEffect<TOutput>,
    context: ToolContext,
  ): Promise<StructuredToolResult<{ created: boolean }>>
  reconcile(
    effect: PreparedEffect<TOutput>,
    context: ToolContext,
  ): Promise<StructuredToolResult<{ created: boolean }>>
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(',')}}`
}

export function effectPayloadHash(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex')
}

export function validatePreparedEffect(effect: PreparedEffect): boolean {
  return (
    effect.schemaVersion === 1 &&
    effect.type === 'reminder' &&
    /^[A-Za-z0-9:._-]{1,512}$/.test(effect.effectId) &&
    /^[A-Za-z0-9:._-]{1,512}$/.test(effect.idempotencyKey) &&
    effectPayloadHash(effect.payload) === effect.payloadHash &&
    ['prepared', 'committing', 'committed'].includes(effect.phase) &&
    typeof effect.linkage.installationId === 'string' &&
    typeof effect.linkage.commandId === 'string' &&
    typeof effect.linkage.jobId === 'string' &&
    typeof effect.linkage.runId === 'string' &&
    Number.isSafeInteger(effect.linkage.attempt)
  )
}

export class CapabilityRegistry {
  private readonly tools = new Map<string, CapabilityTool>()
  private readonly effects = new Map<PreparedEffect['type'], CapabilityTool>()

  register(tool: CapabilityTool): void {
    if (this.tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`)
    if (this.effects.has(tool.effectType)) {
      throw new Error(`duplicate effect type: ${tool.effectType}`)
    }
    this.tools.set(tool.name, tool)
    this.effects.set(tool.effectType, tool)
  }

  names(): string[] {
    return [...this.tools.keys()].sort()
  }

  async prepare(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<StructuredToolResult<PreparedEffect>> {
    const tool = this.tools.get(name)
    if (tool === undefined) {
      return {
        ok: false,
        error: { code: 'unknown_tool', message: `unknown tool: ${name}`, retryable: false },
      }
    }
    try {
      return await tool.prepare(input, context)
    } catch {
      return {
        ok: false,
        error: { code: 'tool_error', message: 'tool failed', retryable: false },
      }
    }
  }

  async commit(
    effect: PreparedEffect,
    context: ToolContext,
  ): Promise<StructuredToolResult<{ created: boolean }>> {
    if (!validatePreparedEffect(effect)) {
      return {
        ok: false,
        error: { code: 'effect_corrupt', message: 'prepared effect is invalid', retryable: false },
      }
    }
    const tool = this.effects.get(effect.type)
    if (tool === undefined) {
      return {
        ok: false,
        error: { code: 'unknown_effect', message: 'effect type is unavailable', retryable: false },
      }
    }
    return await tool.commit(effect, context)
  }

  async reconcile(
    effect: PreparedEffect,
    context: ToolContext,
  ): Promise<StructuredToolResult<{ created: boolean }>> {
    if (!validatePreparedEffect(effect)) {
      return {
        ok: false,
        error: { code: 'effect_corrupt', message: 'prepared effect is invalid', retryable: false },
      }
    }
    const tool = this.effects.get(effect.type)
    if (tool === undefined) {
      return {
        ok: false,
        error: { code: 'unknown_effect', message: 'effect type is unavailable', retryable: false },
      }
    }
    return await tool.reconcile(effect, context)
  }
}

async function commitReminder(
  effect: PreparedEffect<ReminderProduct>,
  context: ToolContext,
): Promise<StructuredToolResult<{ created: boolean }>> {
  if (context.committer === undefined) {
    return {
      ok: false,
      error: { code: 'committer_missing', message: 'effect committer is unavailable', retryable: true },
    }
  }
  const payload = effect.payload
  try {
    const value = await context.committer.createReminder({
      installationId: effect.linkage.installationId,
      reminderId: effect.effectId,
      idempotencyKey: effect.idempotencyKey,
      message: payload.message,
      remindAt: payload.remindAt,
      timezone: payload.timezone,
    })
    return { ok: true, value }
  } catch {
    return {
      ok: false,
      error: { code: 'effect_commit_failed', message: 'effect commit failed', retryable: true },
    }
  }
}

export function reminderTool(): CapabilityTool<ReminderProduct, ReminderProduct> {
  return {
    name: 'create_reminder',
    effectType: 'reminder',
    async prepare(input, context) {
      if (context.signal.aborted) {
        return {
          ok: false,
          error: { code: 'cancelled', message: 'run cancelled', retryable: false },
        }
      }
      if (
        input.kind !== 'reminder' ||
        input.message.trim().length === 0 ||
        !Number.isSafeInteger(input.remindAt) ||
        input.remindAt < 0 ||
        input.timezone.trim().length === 0
      ) {
        return {
          ok: false,
          error: { code: 'invalid_reminder', message: 'invalid reminder product', retryable: false },
        }
      }
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          effectId: context.effectId,
          idempotencyKey: context.idempotencyKey,
          type: 'reminder',
          payload: input,
          payloadHash: effectPayloadHash(input),
          phase: 'prepared',
          linkage: context.linkage,
        },
      }
    },
    async commit(effect, context) {
      return await commitReminder(effect, context)
    },
    async reconcile(effect, context) {
      // Reminder creation is idempotent by both stable ID and idempotency key,
      // so reconciliation deliberately repeats the same canonical mutation.
      return await commitReminder(effect, context)
    },
  }
}

export function minimalProductivityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(reminderTool())
  return registry
}
