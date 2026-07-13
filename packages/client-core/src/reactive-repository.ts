import type { AgentTurnState, ProjectionState } from '@kriyan/contracts'

import type {
  ActivityItem,
  AppNoteItem,
  CalendarEventItem,
  KnowledgeDocumentItem,
  NodeItem,
  NotificationIntentItem,
  ReminderItem,
  SourceRefItem,
  TaskItem,
} from './types'

export interface AgentSnapshot {
  threads: Array<{ threadId: string; agentRevisionId: string; activeTurnId?: string }>
  messages: Array<{ messageId: string; threadId: string; turnOrdinal: number; role: string; state: AgentTurnState; content: string }>
}

export interface KnowledgeSnapshot {
  sources: SourceRefItem[]
  documents: KnowledgeDocumentItem[]
  artifacts: Array<{ artifactId: string; noteVersionId: string; projectionState: ProjectionState }>
}

export interface ClientSnapshot {
  productivity: {
    tasks: TaskItem[]
    reminders: ReminderItem[]
    calendarEvents: CalendarEventItem[]
    notes: AppNoteItem[]
    notificationIntents: NotificationIntentItem[]
  }
  agents: AgentSnapshot
  knowledge: KnowledgeSnapshot
  nodes: { items: NodeItem[]; activity: ActivityItem[] }
  connection: 'connecting' | 'online' | 'reconnecting' | 'offline'
  error?: string
}

export interface ReactiveClientRepository {
  getSnapshot(): ClientSnapshot
  subscribe(listener: () => void): () => void
  dispose(): void
}

export const EMPTY_CLIENT_SNAPSHOT: ClientSnapshot = Object.freeze({
  productivity: { tasks: [], reminders: [], calendarEvents: [], notes: [], notificationIntents: [] },
  agents: { threads: [], messages: [] },
  knowledge: { sources: [], documents: [], artifacts: [] },
  nodes: { items: [], activity: [] },
  connection: 'connecting',
})

/** Coalesces related query updates into one microtask to avoid torn snapshots. */
export function createReactiveSnapshotStore(
  initial: ClientSnapshot = EMPTY_CLIENT_SNAPSHOT,
): ReactiveClientRepository & { replace(snapshot: ClientSnapshot): void } {
  let snapshot = initial
  let disposed = false
  let queued = false
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    replace(next) {
      if (disposed) return
      snapshot = next
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!disposed) for (const listener of [...listeners]) listener()
      })
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
