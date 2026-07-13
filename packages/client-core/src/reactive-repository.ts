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
  /** Monotonic transaction barrier supplied by one atomic backend snapshot. */
  transactionRevision: number
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

export interface SnapshotSubscriptionTransport {
  subscribe(onSnapshot: (snapshot: ClientSnapshot) => void, onError: (error: Error) => void): () => void
  close(): void | Promise<void>
}

export const EMPTY_CLIENT_SNAPSHOT: ClientSnapshot = Object.freeze({
  transactionRevision: 0,
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
      if (next.transactionRevision < snapshot.transactionRevision) return
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


export function createReactiveRepositoryFromTransport(
  transport: SnapshotSubscriptionTransport,
  initial: ClientSnapshot = EMPTY_CLIENT_SNAPSHOT,
): ReactiveClientRepository {
  const store = createReactiveSnapshotStore(initial)
  let disposed = false
  const unsubscribe = transport.subscribe(
    (snapshot) => store.replace({ ...snapshot, error: undefined }),
    (error) => store.replace({ ...store.getSnapshot(), connection: 'reconnecting', error: error.message }),
  )
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      store.dispose()
      void transport.close()
    },
  }
}

export interface DeterministicSnapshotServer {
  connect(): SnapshotSubscriptionTransport
  mutate(update: (current: ClientSnapshot) => Omit<ClientSnapshot, 'transactionRevision'>): ClientSnapshot
  fail(error: Error): void
  reconnect(): void
  getSnapshot(): ClientSnapshot
  activeConnections(): number
}

/** In-memory transaction/subscription harness used by both Web and Expo adapter contracts. */
export function createDeterministicSnapshotServer(initial: ClientSnapshot = EMPTY_CLIENT_SNAPSHOT): DeterministicSnapshotServer {
  let snapshot = initial
  let connected = true
  const clients = new Set<{ next: (snapshot: ClientSnapshot) => void; error: (error: Error) => void }>()
  return {
    connect() {
      let closed = false
      let listener: { next: (snapshot: ClientSnapshot) => void; error: (error: Error) => void } | undefined
      return {
        subscribe(next, error) {
          listener = { next, error }
          clients.add(listener)
          if (connected) queueMicrotask(() => { if (!closed) next(snapshot) })
          return () => { if (listener) clients.delete(listener) }
        },
        close() {
          if (closed) return
          closed = true
          if (listener) clients.delete(listener)
        },
      }
    },
    mutate(update) {
      snapshot = { ...update(snapshot), transactionRevision: snapshot.transactionRevision + 1 }
      if (connected) for (const client of [...clients]) client.next(snapshot)
      return snapshot
    },
    fail(error) {
      connected = false
      for (const client of [...clients]) client.error(error)
    },
    reconnect() {
      connected = true
      for (const client of [...clients]) client.next(snapshot)
    },
    getSnapshot: () => snapshot,
    activeConnections: () => clients.size,
  }
}
