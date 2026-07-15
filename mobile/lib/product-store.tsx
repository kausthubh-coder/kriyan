import type {
  AppNoteItem, CalendarEventItem, ClientSnapshot, KnowledgeDocumentItem, ProductMutationResult, ProductRepository, ReactiveClientRepository,
  ReminderItem, SourceRefItem, TaskItem,
} from '@kriyan/client-core'
import React, { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getDemoRepository, persistDemoRepository } from '@/lib/demo-repository'
import { createConvexRepository } from '@/lib/convex-repository'

type Entity = TaskItem | ReminderItem | CalendarEventItem | AppNoteItem

interface ProductState {
  mode: 'demo' | 'convex'
  connection: 'connecting' | 'online' | 'offline' | 'reconnecting'
  error?: string
  tasks: TaskItem[]
  reminders: ReminderItem[]
  events: CalendarEventItem[]
  notes: AppNoteItem[]
  sources: SourceRefItem[]
  knowledge: KnowledgeDocumentItem[]
  repository?: ProductRepository
  refresh(): Promise<void>
  runWrite<T extends Entity>(operation: (repository: ProductRepository) => Promise<ProductMutationResult<T>>): Promise<ProductMutationResult<T>>
}

const StoreContext = createContext<ProductState | null>(null)

function isReactive(repository: ProductRepository): repository is ProductRepository & ReactiveClientRepository {
  return 'getSnapshot' in repository && 'subscribe' in repository && 'dispose' in repository
}

export async function loadAllProductPages<T>(load: (cursor: string | null) => Promise<{ items: T[]; cursor: string | null; done: boolean }>): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const page = await load(cursor)
    items.push(...page.items)
    if (page.done || page.cursor === null) return items
    cursor = page.cursor
  } while (true)
}

export async function settleRepositorySetup(
  setup: Promise<ProductRepository>,
  isCurrent: () => boolean,
  accept: (repository: ProductRepository) => void,
  reject: (cause: unknown) => void,
): Promise<void> {
  try {
    const next = await setup
    if (!isCurrent()) {
      if (isReactive(next)) next.dispose()
      return
    }
    accept(next)
  } catch (cause) {
    if (isCurrent()) reject(cause)
  }
}

export function ProductStoreProvider({
  children,
  repositoryFactory,
}: {
  children: ReactNode
  repositoryFactory?: () => Promise<ProductRepository>
}) {
  const [repository, setRepository] = useState<ProductRepository>()
  const [connection, setConnection] = useState<ProductState['connection']>('connecting')
  const [error, setError] = useState<string>()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [events, setEvents] = useState<CalendarEventItem[]>([])
  const [notes, setNotes] = useState<AppNoteItem[]>([])
  const [sources, setSources] = useState<SourceRefItem[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeDocumentItem[]>([])
  const setupGeneration = useRef(0)
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const mode: ProductState['mode'] = process.env.EXPO_PUBLIC_CONVEX_URL ? 'convex' : 'demo'

  const refresh = useCallback(async () => {
    if (!repository) return
    const reactiveSnapshot = isReactive(repository) ? repository.getSnapshot() : undefined
    if (reactiveSnapshot) { setConnection(reactiveSnapshot.connection); setError(reactiveSnapshot.error) }
    else setConnection((current) => current === 'online' ? 'reconnecting' : 'connecting')
    try {
      const [allTasks, allReminders, allEvents, allNotes, allSources, allKnowledge] = await Promise.all([
        loadAllProductPages((cursor) => repository.tasksV1.list({ cursor, limit: 100 })),
        loadAllProductPages((cursor) => repository.remindersV1.list({ cursor, limit: 100 })),
        loadAllProductPages((cursor) => repository.calendarV1.list({ cursor, limit: 100 })),
        loadAllProductPages((cursor) => repository.notesV1.list({ cursor, limit: 100 })),
        loadAllProductPages((cursor) => repository.sourceRefsV1.list({ cursor, limit: 100 })),
        loadAllProductPages((cursor) => repository.knowledgeV1.list({ cursor, limit: 100 })),
      ])
      setTasks(allTasks); setReminders(allReminders); setEvents(allEvents)
      setNotes(allNotes); setSources(allSources); setKnowledge(allKnowledge)
      setConnection(reactiveSnapshot?.connection ?? 'online'); setError(reactiveSnapshot?.error)
    } catch (cause) {
      setConnection('offline')
      setError(cause instanceof Error ? cause.message : 'Unable to refresh. Showing last confirmed data.')
    }
  }, [repository])

  useEffect(() => {
    const generation = setupGeneration.current + 1
    setupGeneration.current = generation
    let resolved: ProductRepository | undefined
    let active = true
    const setup = repositoryFactory
      ? repositoryFactory()
      : process.env.EXPO_PUBLIC_CONVEX_URL
        ? createConvexRepository(process.env.EXPO_PUBLIC_CONVEX_URL)
        : getDemoRepository()
    void settleRepositorySetup(
      setup,
      () => active && setupGeneration.current === generation,
      (next) => { resolved = next; setRepository(next) },
      (cause) => { setConnection('offline'); setError(cause instanceof Error ? cause.message : 'Data setup failed') },
    )
    return () => {
      active = false
      if (setupGeneration.current === generation) setupGeneration.current += 1
      if (resolved && isReactive(resolved)) resolved.dispose()
    }
  }, [repositoryFactory])
  useEffect(() => {
    if (!repository) return
    if (!isReactive(repository)) { void refresh(); return }
    const synchronize = (): void => {
      const snapshot: ClientSnapshot = repository.getSnapshot()
      setConnection(snapshot.connection); setError(snapshot.error)
      void refresh()
    }
    synchronize()
    const unsubscribe = repository.subscribe(synchronize)
    return () => { unsubscribe(); repository.dispose() }
  }, [refresh, repository])

  const runWrite = useCallback(<T extends Entity,>(operation: (value: ProductRepository) => Promise<ProductMutationResult<T>>): Promise<ProductMutationResult<T>> => {
    const pending = writeQueue.current.then(async () => {
      if (!repository) return { ok: false, reason: 'transport_error', message: 'Repository is still connecting.' } as ProductMutationResult<T>
      const result = await operation(repository)
      if (!result.ok) {
        setError(result.message)
        return result
      }
      if (mode === 'demo') await persistDemoRepository(repository)
      setError(undefined)
      await refresh()
      return result
    })
    writeQueue.current = pending.then(() => undefined, () => undefined)
    return pending
  }, [mode, refresh, repository])

  const value = useMemo(() => ({ mode, connection, error, tasks, reminders, events, notes, sources, knowledge, repository, refresh, runWrite }),
    [mode, connection, error, tasks, reminders, events, notes, sources, knowledge, repository, refresh, runWrite])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useProductStore(): ProductState {
  const value = React.use(StoreContext)
  if (!value) throw new Error('useProductStore must be used inside ProductStoreProvider')
  return value
}
