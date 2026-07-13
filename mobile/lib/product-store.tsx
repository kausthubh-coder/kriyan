import type {
  AppNoteItem, CalendarEventItem, KnowledgeDocumentItem, ProductMutationResult, ProductRepository,
  ReminderItem, SourceRefItem, TaskItem,
} from '@kriyan/client-core'
import React, { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { getDemoRepository } from '@/lib/demo-repository'
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

export function ProductStoreProvider({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<ProductRepository>()
  const [connection, setConnection] = useState<ProductState['connection']>('connecting')
  const [error, setError] = useState<string>()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [events, setEvents] = useState<CalendarEventItem[]>([])
  const [notes, setNotes] = useState<AppNoteItem[]>([])
  const [sources, setSources] = useState<SourceRefItem[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeDocumentItem[]>([])
  const mode: ProductState['mode'] = process.env.EXPO_PUBLIC_CONVEX_URL ? 'convex' : 'demo'

  const refresh = useCallback(async () => {
    if (!repository) return
    setConnection((current) => current === 'online' ? 'reconnecting' : 'connecting')
    try {
      const [taskPage, reminderPage, eventPage, notePage, sourcePage, knowledgePage] = await Promise.all([
        repository.tasksV1.list({ limit: 100 }), repository.remindersV1.list({ limit: 100 }),
        repository.calendarV1.list({ limit: 100 }), repository.notesV1.list({ limit: 100 }),
        repository.sourceRefsV1.list({ limit: 100 }), repository.knowledgeV1.list({ limit: 100 }),
      ])
      setTasks(taskPage.items); setReminders(reminderPage.items); setEvents(eventPage.items)
      setNotes(notePage.items); setSources(sourcePage.items); setKnowledge(knowledgePage.items)
      setConnection('online'); setError(undefined)
    } catch (cause) {
      setConnection('offline')
      setError(cause instanceof Error ? cause.message : 'Unable to refresh. Showing last confirmed data.')
    }
  }, [repository])

  useEffect(() => {
    const setup = process.env.EXPO_PUBLIC_CONVEX_URL
      ? createConvexRepository(process.env.EXPO_PUBLIC_CONVEX_URL)
      : getDemoRepository()
    setup.then(setRepository).catch((cause: unknown) => {
      setConnection('offline'); setError(cause instanceof Error ? cause.message : 'Data setup failed')
    })
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const runWrite = useCallback(async <T extends Entity,>(operation: (value: ProductRepository) => Promise<ProductMutationResult<T>>) => {
    if (!repository) return { ok: false, reason: 'transport_error', message: 'Repository is still connecting.' } as ProductMutationResult<T>
    const result = await operation(repository)
    if (result.ok) await refresh()
    else setError(result.message)
    return result
  }, [refresh, repository])

  const value = useMemo(() => ({ mode, connection, error, tasks, reminders, events, notes, sources, knowledge, repository, refresh, runWrite }),
    [mode, connection, error, tasks, reminders, events, notes, sources, knowledge, repository, refresh, runWrite])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useProductStore(): ProductState {
  const value = React.use(StoreContext)
  if (!value) throw new Error('useProductStore must be used inside ProductStoreProvider')
  return value
}
