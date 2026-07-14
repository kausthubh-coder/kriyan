import { runtimeSchema, type RuntimeSchema } from './runtime-schema'
import type { WorkerCommandResult, WorkerJobResult, WorkerRunResult } from './worker-operations'
import { workerCommandResultSchema, workerJobResultSchema, workerRunResultSchema } from './worker-results'

export interface SnapshotTaskWire {
  installationId: string; taskId: string; idempotencyKey: string; title: string;
  description?: string; tags: string[]; priority?: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'completed' | 'cancelled'; startAt?: number; dueAt?: number;
  projectId?: string; entityId?: string; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotReminderWire {
  installationId: string; reminderId: string; idempotencyKey: string; message: string;
  remindAt: number; nextFireAt?: number; timezone: string; deliveryPolicy: 'normal' | 'persistent' | 'critical';
  status: 'scheduled' | 'fired' | 'acknowledged' | 'dismissed' | 'cancelled'; scheduleKey: string;
  fireCount: number; acknowledgedAt?: number; snoozedUntil?: number; lastFiredAt?: number;
  linkedTaskId?: string; entityId?: string; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotCalendarEventWire {
  installationId: string; calendarEventId: string; idempotencyKey: string; title: string; description?: string;
  startAt: number; endAt: number; timezone: string; allDay: boolean; location?: string; sourceUrl?: string;
  status: 'confirmed' | 'tentative' | 'cancelled'; sourceProvider?: string; externalCalendarId?: string;
  externalEventId?: string; recurrenceRule?: string; recurringEventId?: string; originalStartAt?: number;
  sourceRefId?: string; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotNoteWire {
  installationId: string; noteId: string; idempotencyKey: string; title?: string; contentJson: string;
  plainTextPreview: string; wordCount: number; tags: string[]; entityId?: string;
  currentVersionId?: string; contentHash?: string; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotNotificationIntentWire {
  installationId: string; notificationIntentId: string; reminderId: string; scheduledFor: number;
  deliveryPolicy: 'normal' | 'persistent' | 'critical'; dedupeKey: string;
  lifecycle: 'queued' | 'dispatched' | 'acknowledged' | 'failed' | 'cancelled'; attempt: number;
  escalationLevel: number; targetDeviceId?: string; lastAttemptAt?: number; lastError?: string;
  revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotSourceWire {
  installationId: string; sourceRefId: string; idempotencyKey: string; kind: 'audio' | 'video' | 'document' | 'web' | 'git' | 'calendar' | 'email' | 'chat' | 'other'; displayName: string;
  sourceUrl?: string; externalId?: string; contentHash?: string; syncState: 'pending' | 'synced' | 'failed' | 'stale'; indexState: 'pending' | 'indexed' | 'failed' | 'stale';
  provenanceIds: string[]; lastSyncedAt?: number; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotKnowledgeWire {
  installationId: string; knowledgeDocumentId: string; idempotencyKey: string; kind: 'person' | 'project' | 'topic' | 'organization' | 'place' | 'event' | 'other'; title: string;
  summary: string; tags: string[]; sourceRefIds: string[]; provenanceIds: string[]; syncState: 'pending' | 'synced' | 'failed' | 'stale';
  indexState: 'pending' | 'indexed' | 'failed' | 'stale'; revision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotArtifactWire {
  installationId: string; artifactId: string; noteId: string; noteVersionId: string; slug: string;
  projectionState: 'pending' | 'projected' | 'failed' | 'tombstoned'; projectedHash?: string; projectedPath?: string;
  priorProjectedHash?: string; priorProjectedPath?: string; lastError?: string; revision: number;
  createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotNodeWire {
  installationId: string; nodeId: string; displayName: string; capabilities: string[]; protocolVersion: string;
  status: 'online' | 'offline' | 'revoked'; lastHeartbeatAt: number; revision: number; createdAt: number; updatedAt: number;
}
export interface SnapshotThreadWire {
  installationId: string; threadId: string; agentId: string; agentRevisionId: string; title?: string;
  nextTurnOrdinal: number; activeTurnId?: string; preferredNodeId?: string; piSessionRef?: string;
  sessionRevision: number; createdAt: number; updatedAt: number; deletedAt?: number;
}
export interface SnapshotMessageWire {
  installationId: string; messageId: string; threadId: string; turnId: string; turnOrdinal: number;
  role: 'user' | 'assistant' | 'system' | 'tool'; state: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_node';
  content: string; origin: string; agentRevisionId: string; createdAt: number; updatedAt: number; finalizedAt?: number;
}

export interface ClientSnapshotWire {
  transactionRevision: number
  windows: {
    tasks: SnapshotWindowWire; reminders: SnapshotWindowWire; calendarEvents: SnapshotWindowWire;
    notes: SnapshotWindowWire; notificationIntents: SnapshotWindowWire; sources: SnapshotWindowWire;
    documents: SnapshotWindowWire; artifacts: SnapshotWindowWire; nodes: SnapshotWindowWire;
    threads: SnapshotWindowWire; messages: SnapshotWindowWire; activity: SnapshotWindowWire;
  }
  productivity: {
    tasks: SnapshotTaskWire[]; reminders: SnapshotReminderWire[]; calendarEvents: SnapshotCalendarEventWire[];
    notes: SnapshotNoteWire[]; notificationIntents: SnapshotNotificationIntentWire[];
  }
  agents: { threads: SnapshotThreadWire[]; messages: SnapshotMessageWire[] }
  knowledge: { sources: SnapshotSourceWire[]; documents: SnapshotKnowledgeWire[]; artifacts: SnapshotArtifactWire[] }
  nodes: {
    items: SnapshotNodeWire[]
    activity: Array<{ command: WorkerCommandResult; job?: WorkerJobResult; run?: WorkerRunResult }>
  }
}

export interface SnapshotWindowWire {
  limit: number
  returned: number
  truncated: boolean
}

const s = runtimeSchema
const string = s.string
const number = s.number
const boolean = s.boolean
const optionalString = s.optional(string)
const optionalNumber = s.optional(number)
const strings = s.array(string)

export const snapshotTaskSchema = s.object({
  installationId: string, taskId: string, idempotencyKey: string, title: string,
  description: optionalString, tags: strings,
  priority: s.optional(s.union(s.literal('low'), s.literal('normal'), s.literal('high'), s.literal('urgent'))),
  status: s.union(s.literal('open'), s.literal('completed'), s.literal('cancelled')),
  startAt: optionalNumber, dueAt: optionalNumber, projectId: optionalString, entityId: optionalString,
  revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotTaskWire>
export const snapshotReminderSchema = s.object({
  installationId: string, reminderId: string, idempotencyKey: string, message: string,
  remindAt: number, nextFireAt: optionalNumber, timezone: string,
  deliveryPolicy: s.union(s.literal('normal'), s.literal('persistent'), s.literal('critical')),
  status: s.union(s.literal('scheduled'), s.literal('fired'), s.literal('acknowledged'), s.literal('dismissed'), s.literal('cancelled')),
  scheduleKey: string, fireCount: number, acknowledgedAt: optionalNumber, snoozedUntil: optionalNumber,
  lastFiredAt: optionalNumber, linkedTaskId: optionalString, entityId: optionalString,
  revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotReminderWire>
export const snapshotCalendarEventSchema = s.object({
  installationId: string, calendarEventId: string, idempotencyKey: string, title: string,
  description: optionalString, startAt: number, endAt: number, timezone: string, allDay: boolean,
  location: optionalString, sourceUrl: optionalString,
  status: s.union(s.literal('confirmed'), s.literal('tentative'), s.literal('cancelled')),
  sourceProvider: optionalString, externalCalendarId: optionalString, externalEventId: optionalString,
  recurrenceRule: optionalString, recurringEventId: optionalString, originalStartAt: optionalNumber,
  sourceRefId: optionalString, revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotCalendarEventWire>
export const snapshotNoteSchema = s.object({
  installationId: string, noteId: string, idempotencyKey: string, title: optionalString,
  contentJson: string, plainTextPreview: string, wordCount: number, tags: strings,
  entityId: optionalString, currentVersionId: optionalString, contentHash: optionalString,
  revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotNoteWire>
export const snapshotNotificationIntentSchema = s.object({
  installationId: string, notificationIntentId: string, reminderId: string, scheduledFor: number,
  deliveryPolicy: s.union(s.literal('normal'), s.literal('persistent'), s.literal('critical')),
  dedupeKey: string, lifecycle: s.union(s.literal('queued'), s.literal('dispatched'), s.literal('acknowledged'), s.literal('failed'), s.literal('cancelled')),
  attempt: number, escalationLevel: number, targetDeviceId: optionalString, lastAttemptAt: optionalNumber,
  lastError: optionalString, revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotNotificationIntentWire>
export const snapshotSourceSchema = s.object({
  installationId: string, sourceRefId: string, idempotencyKey: string,
  kind: s.union(s.literal('audio'), s.literal('video'), s.literal('document'), s.literal('web'), s.literal('git'), s.literal('calendar'), s.literal('email'), s.literal('chat'), s.literal('other')),
  displayName: string, sourceUrl: optionalString, externalId: optionalString, contentHash: optionalString,
  syncState: s.union(s.literal('pending'), s.literal('synced'), s.literal('failed'), s.literal('stale')),
  indexState: s.union(s.literal('pending'), s.literal('indexed'), s.literal('failed'), s.literal('stale')),
  provenanceIds: strings, lastSyncedAt: optionalNumber, revision: number, createdAt: number,
  updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotSourceWire>
export const snapshotKnowledgeSchema = s.object({
  installationId: string, knowledgeDocumentId: string, idempotencyKey: string,
  kind: s.union(s.literal('person'), s.literal('project'), s.literal('topic'), s.literal('organization'), s.literal('place'), s.literal('event'), s.literal('other')),
  title: string, summary: string, tags: strings, sourceRefIds: strings, provenanceIds: strings,
  syncState: s.union(s.literal('pending'), s.literal('synced'), s.literal('failed'), s.literal('stale')),
  indexState: s.union(s.literal('pending'), s.literal('indexed'), s.literal('failed'), s.literal('stale')),
  revision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotKnowledgeWire>
export const snapshotArtifactSchema = s.object({
  installationId: string, artifactId: string, noteId: string, noteVersionId: string, slug: string,
  projectionState: s.union(s.literal('pending'), s.literal('projected'), s.literal('failed'), s.literal('tombstoned')),
  projectedHash: optionalString, projectedPath: optionalString, priorProjectedHash: optionalString,
  priorProjectedPath: optionalString, lastError: optionalString, revision: number,
  createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotArtifactWire>
export const snapshotNodeSchema = s.object({
  installationId: string, nodeId: string, displayName: string, capabilities: strings,
  protocolVersion: string, status: s.union(s.literal('online'), s.literal('offline'), s.literal('revoked')),
  lastHeartbeatAt: number, revision: number, createdAt: number, updatedAt: number,
}) satisfies RuntimeSchema<SnapshotNodeWire>
export const snapshotThreadSchema = s.object({
  installationId: string, threadId: string, agentId: string, agentRevisionId: string, title: optionalString,
  nextTurnOrdinal: number, activeTurnId: optionalString, preferredNodeId: optionalString,
  piSessionRef: optionalString, sessionRevision: number, createdAt: number, updatedAt: number, deletedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotThreadWire>
export const snapshotMessageSchema = s.object({
  installationId: string, messageId: string, threadId: string, turnId: string, turnOrdinal: number,
  role: s.union(s.literal('user'), s.literal('assistant'), s.literal('system'), s.literal('tool')),
  state: s.union(s.literal('queued'), s.literal('active'), s.literal('completed'), s.literal('failed'), s.literal('cancelled'), s.literal('waiting_for_node')),
  content: string, origin: string, agentRevisionId: string, createdAt: number, updatedAt: number, finalizedAt: optionalNumber,
}) satisfies RuntimeSchema<SnapshotMessageWire>
export const snapshotWindowSchema = s.object({ limit: number, returned: number, truncated: boolean }) satisfies RuntimeSchema<SnapshotWindowWire>
const activitySchema = s.object({
  command: workerCommandResultSchema,
  job: s.optional(workerJobResultSchema),
  run: s.optional(workerRunResultSchema),
})
export const clientSnapshotSchema = s.object({
  transactionRevision: number,
  windows: s.object({
    tasks: snapshotWindowSchema, reminders: snapshotWindowSchema, calendarEvents: snapshotWindowSchema,
    notes: snapshotWindowSchema, notificationIntents: snapshotWindowSchema, sources: snapshotWindowSchema,
    documents: snapshotWindowSchema, artifacts: snapshotWindowSchema, nodes: snapshotWindowSchema,
    threads: snapshotWindowSchema, messages: snapshotWindowSchema, activity: snapshotWindowSchema,
  }),
  productivity: s.object({
    tasks: s.array(snapshotTaskSchema), reminders: s.array(snapshotReminderSchema),
    calendarEvents: s.array(snapshotCalendarEventSchema), notes: s.array(snapshotNoteSchema),
    notificationIntents: s.array(snapshotNotificationIntentSchema),
  }),
  agents: s.object({ threads: s.array(snapshotThreadSchema), messages: s.array(snapshotMessageSchema) }),
  knowledge: s.object({ sources: s.array(snapshotSourceSchema), documents: s.array(snapshotKnowledgeSchema), artifacts: s.array(snapshotArtifactSchema) }),
  nodes: s.object({ items: s.array(snapshotNodeSchema), activity: s.array(activitySchema) }),
}) satisfies RuntimeSchema<ClientSnapshotWire>

/** Portable runtime boundary for the one aggregate Convex subscription payload. */
export function isClientSnapshotWire(value: unknown): value is ClientSnapshotWire {
  return clientSnapshotSchema.validate(value)
}

export function parseClientSnapshotWire(value: unknown): ClientSnapshotWire {
  if (!isClientSnapshotWire(value)) throw new Error('invalid client snapshot result')
  return value
}
