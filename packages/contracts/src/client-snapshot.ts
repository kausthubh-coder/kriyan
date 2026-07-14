import type { WorkerCommandResult, WorkerJobResult, WorkerRunResult } from './worker-operations'

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

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function rows(value: unknown, id: string, revisionField = 'revision'): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => {
    const row = record(item)
    return row !== null && typeof row[id] === 'string' && finite(row[revisionField])
  })
}

/** Portable runtime boundary for the one aggregate Convex subscription payload. */
export function isClientSnapshotWire(value: unknown): value is ClientSnapshotWire {
  const root = record(value); if (root === null || !finite(root.transactionRevision)) return false
  const productivity = record(root.productivity); const agents = record(root.agents)
  const knowledge = record(root.knowledge); const nodes = record(root.nodes)
  if (productivity === null || agents === null || knowledge === null || nodes === null) return false
  if (!rows(productivity.tasks, 'taskId') || !rows(productivity.reminders, 'reminderId') || !rows(productivity.calendarEvents, 'calendarEventId') || !rows(productivity.notes, 'noteId') || !rows(productivity.notificationIntents, 'notificationIntentId')) return false
  if (!rows(agents.threads, 'threadId', 'sessionRevision') || !rows(agents.messages, 'messageId', 'turnOrdinal')) return false
  if (!rows(knowledge.sources, 'sourceRefId') || !rows(knowledge.documents, 'knowledgeDocumentId') || !rows(knowledge.artifacts, 'artifactId')) return false
  if (!rows(nodes.items, 'nodeId') || !Array.isArray(nodes.activity)) return false
  return nodes.activity.every((item) => {
    const activity = record(item)
    if (activity === null) return false
    const command = record(activity.command)
    if (command === null || typeof command.commandId !== 'string' || !finite(command.revision)) return false
    const job = activity.job === undefined ? undefined : record(activity.job)
    const run = activity.run === undefined ? undefined : record(activity.run)
    return (job === undefined || (job !== null && typeof job.jobId === 'string' && finite(job.revision)))
      && (run === undefined || (run !== null && typeof run.runId === 'string' && finite(run.revision)))
  })
}

export function parseClientSnapshotWire(value: unknown): ClientSnapshotWire {
  if (!isClientSnapshotWire(value)) throw new Error('invalid client snapshot result')
  return value
}
