'use client'

import {
  beginPending,
  conflictMessage,
  createClientId,
  deriveActivity,
  deriveConnectionMode,
  endPending,
  INITIAL_CONNECTION_TRACKER,
  mergeOptimistic,
  needsConnectionRecreate,
  normalizeTransitionReason,
  PAGE_SIZE,
  reconcileEntities,
  reconcilePatches,
  RECONNECT_CONFIRMATION_TIMEOUT_MS,
  retainLastConfirmed,
  updateConnectionTracker,
  type ActionResult,
  type ActivityProjectionItem,
  type ClientRepository,
  type ConnectionMode,
  type EntityPatch,
  type InstallationItem,
  type NodeItem,
  type PageState,
  type ReminderItem,
  type ReminderStatus,
  type RunEventItem,
  type TaskItem,
  type TaskStatus,
} from '@kriyan/client-core'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  useConvexConnectionState,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react'

import { api } from '@convex/_generated/api'
import type { KriyanWebConfiguration } from '@/lib/convex'

import { observeConvexConnection } from './convex-connection-adapter'

type PaginationStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

function pageState(status: PaginationStatus, loadedCount: number): PageState {
  return {
    canLoadMore: status === 'CanLoadMore',
    loadingMore: status === 'LoadingMore',
    loadedCount,
  }
}

function failure(reason: unknown, error?: unknown): ActionResult<never> {
  const normalized = normalizeTransitionReason(reason)
  if (normalized === 'transport_error' && error instanceof Error) {
    return { ok: false, reason: normalized, message: `${conflictMessage(normalized)} ${error.message}` }
  }
  return { ok: false, reason: normalized, message: conflictMessage(normalized) }
}

export interface ConvexRepositoryResult {
  repository: ClientRepository
  connectionMode: ConnectionMode
  connectionRecoveryRequired: boolean
}

interface RemoteSnapshot {
  installation: InstallationItem | null | undefined
  tasks: TaskItem[]
  reminders: ReminderItem[]
  activity: ActivityProjectionItem[]
  nodes: NodeItem[]
  runEvents: RunEventItem[]
  loading: boolean
  loadingRunEvents: boolean
  pages: ClientRepository['pages']
}

export function useConvexRepository(
  configuration: KriyanWebConfiguration,
  selectedRunId: string | null,
  clientGeneration: number,
): ConvexRepositoryResult {
  const { installationId } = configuration
  const connection = useConvexConnectionState()
  const connectionObservation = useMemo(
    () => observeConvexConnection({
      connectionCount: connection.connectionCount,
      hasEverConnected: connection.hasEverConnected,
      isWebSocketConnected: connection.isWebSocketConnected,
    }),
    [connection.connectionCount, connection.hasEverConnected, connection.isWebSocketConnected],
  )
  const initialConnection = useRef(connectionObservation)
  const initialClientGeneration = useRef(clientGeneration)
  const previousClientGeneration = useRef(clientGeneration)
  const [connectionTracker, dispatchConnection] = useReducer(
    updateConnectionTracker,
    INITIAL_CONNECTION_TRACKER,
  )
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([])
  const [pendingReminders, setPendingReminders] = useState<ReminderItem[]>([])
  const [taskPatches, setTaskPatches] = useState<Record<string, EntityPatch<TaskItem>>>({})
  const [reminderPatches, setReminderPatches] = useState<Record<string, EntityPatch<ReminderItem>>>({})
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const pendingRef = useRef(new Set<string>())

  const installation = useQuery(api.installations.get, { installationId })
  const connectionProbe = useQuery(
    api.read.connectionProbe,
    connection.isWebSocketConnected && connection.connectionCount > 0
      ? { installationId, connectionCount: connection.connectionCount }
      : 'skip',
  )
  const openTasksPage = usePaginatedQuery(
    api.projections.listTasks,
    { installationId, status: 'open', includeDeleted: false },
    { initialNumItems: PAGE_SIZE },
  )
  const completedTasksPage = usePaginatedQuery(
    api.projections.listTasks,
    { installationId, status: 'completed', includeDeleted: false },
    { initialNumItems: PAGE_SIZE },
  )
  const scheduledRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'scheduled', includeDeleted: false },
    { initialNumItems: PAGE_SIZE },
  )
  const firedRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'fired', includeDeleted: false },
    { initialNumItems: PAGE_SIZE },
  )
  const dismissedRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'dismissed', includeDeleted: false },
    { initialNumItems: PAGE_SIZE },
  )
  const activityPage = usePaginatedQuery(
    api.read.activity,
    { installationId },
    { initialNumItems: PAGE_SIZE },
  )
  const nodesPage = usePaginatedQuery(
    api.read.nodes,
    { installationId },
    { initialNumItems: PAGE_SIZE },
  )
  const runEventsPage = usePaginatedQuery(
    api.read.runEvents,
    selectedRunId ? { installationId, runId: selectedRunId } : 'skip',
    { initialNumItems: 50 },
  )

  const submitCommandMutation = useMutation(api.commands.submit)
  const cancelCommandMutation = useMutation(api.commands.cancel)
  const retryCommandMutation = useMutation(api.commands.retry)
  const createTaskMutation = useMutation(api.projections.createTask)
  const updateTaskMutation = useMutation(api.projections.updateTask)
  const setTaskStatusMutation = useMutation(api.projections.setTaskStatus)
  const tombstoneTaskMutation = useMutation(api.projections.tombstoneTask)
  const createReminderMutation = useMutation(api.projections.createReminder)
  const updateReminderMutation = useMutation(api.projections.updateReminder)
  const setReminderStatusMutation = useMutation(api.projections.setReminderStatus)
  const tombstoneReminderMutation = useMutation(api.projections.tombstoneReminder)

  useEffect(() => {
    dispatchConnection({
      type: 'mounted',
      browserOnline: navigator.onLine,
      clientGeneration: initialClientGeneration.current,
      observation: initialConnection.current,
      now: Date.now(),
    })
    const online = (): void => dispatchConnection({ type: 'browser-online', now: Date.now() })
    const offline = (): void => dispatchConnection({ type: 'browser-offline', now: Date.now() })
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  useEffect(() => {
    if (previousClientGeneration.current === clientGeneration) return
    previousClientGeneration.current = clientGeneration
    dispatchConnection({
      type: 'client-replaced',
      browserOnline: navigator.onLine,
      clientGeneration,
      now: Date.now(),
    })
  }, [clientGeneration])

  useEffect(() => {
    dispatchConnection({
      type: 'observed',
      clientGeneration,
      observation: connectionObservation,
      now: Date.now(),
    })
  }, [clientGeneration, connectionObservation])

  useEffect(() => {
    if (connectionProbe?.connectionCount !== connection.connectionCount) return
    dispatchConnection({
      type: 'subscription-confirmed',
      clientGeneration,
      connectionCount: connectionProbe.connectionCount,
    })
  }, [clientGeneration, connection.connectionCount, connectionProbe])

  useEffect(() => {
    if (
      (connectionTracker.recovery !== 'awaiting-ready'
        && connectionTracker.recovery !== 'awaiting-subscription')
      || connectionTracker.confirmationDeadlineAt === null
    ) return
    const connectionCount = connectionTracker.readyCount
    const remaining = Math.max(
      0,
      connectionTracker.confirmationDeadlineAt - Date.now(),
    )
    const timer = setTimeout(() => {
      dispatchConnection(connectionTracker.recovery === 'awaiting-ready'
        ? {
            type: 'ready-timeout',
            clientGeneration: connectionTracker.clientGeneration,
            connectionCount,
            now: Date.now(),
          }
        : {
            type: 'confirmation-timeout',
            clientGeneration: connectionTracker.clientGeneration,
            connectionCount,
            now: Date.now(),
          })
    }, Math.min(remaining, RECONNECT_CONFIRMATION_TIMEOUT_MS))
    return () => clearTimeout(timer)
  }, [
    connectionTracker.confirmationDeadlineAt,
    connectionTracker.clientGeneration,
    connectionTracker.readyCount,
    connectionTracker.recovery,
  ])

  const currentTasks = useMemo(
    () => [...openTasksPage.results, ...completedTasksPage.results] as TaskItem[],
    [completedTasksPage.results, openTasksPage.results],
  )
  const currentReminders = useMemo(
    () => [
      ...scheduledRemindersPage.results,
      ...firedRemindersPage.results,
      ...dismissedRemindersPage.results,
    ] as ReminderItem[],
    [dismissedRemindersPage.results, firedRemindersPage.results, scheduledRemindersPage.results],
  )
  const currentLoading = [
    openTasksPage.status,
    completedTasksPage.status,
    scheduledRemindersPage.status,
    firedRemindersPage.status,
    dismissedRemindersPage.status,
    activityPage.status,
    nodesPage.status,
  ].some((status) => status === 'LoadingFirstPage')
  const remindersCanLoadMore = [
    scheduledRemindersPage.status,
    firedRemindersPage.status,
    dismissedRemindersPage.status,
  ].some((status) => status === 'CanLoadMore')
  const remindersLoadingMore = [
    scheduledRemindersPage.status,
    firedRemindersPage.status,
    dismissedRemindersPage.status,
  ].some((status) => status === 'LoadingMore')
  const currentPages = useMemo<ClientRepository['pages']>(() => ({
    openTasks: pageState(openTasksPage.status, openTasksPage.results.length),
    completedTasks: pageState(completedTasksPage.status, completedTasksPage.results.length),
    reminders: {
      canLoadMore: remindersCanLoadMore,
      loadingMore: remindersLoadingMore,
      loadedCount: currentReminders.length,
    },
    activity: {
      canLoadMore: activityPage.status === 'CanLoadMore',
      loadingMore: activityPage.status === 'LoadingMore',
      loadedCount: activityPage.results.length,
    },
    runEvents: pageState(runEventsPage.status, runEventsPage.results.length),
  }), [
    activityPage.results.length,
    activityPage.status,
    completedTasksPage.results.length,
    completedTasksPage.status,
    currentReminders.length,
    openTasksPage.results.length,
    openTasksPage.status,
    remindersCanLoadMore,
    remindersLoadingMore,
    runEventsPage.results.length,
    runEventsPage.status,
  ])
  const currentSnapshot = useMemo<RemoteSnapshot>(() => ({
    installation: installation as InstallationItem | null | undefined,
    tasks: currentTasks,
    reminders: currentReminders,
    activity: activityPage.results as ActivityProjectionItem[],
    nodes: nodesPage.results as NodeItem[],
    runEvents: runEventsPage.results as RunEventItem[],
    loading: currentLoading,
    loadingRunEvents: runEventsPage.status === 'LoadingFirstPage',
    pages: currentPages,
  }), [
    activityPage.results,
    currentLoading,
    currentPages,
    currentReminders,
    currentTasks,
    installation,
    nodesPage.results,
    runEventsPage.results,
    runEventsPage.status,
  ])
  const connectionMode = deriveConnectionMode(connectionTracker)
  const lastConfirmedSnapshot = useRef<RemoteSnapshot | null>(null)
  useEffect(() => {
    if (connectionMode === 'online') lastConfirmedSnapshot.current = currentSnapshot
  }, [connectionMode, currentSnapshot])
  const remote = retainLastConfirmed(
    connectionMode,
    currentSnapshot,
    lastConfirmedSnapshot.current,
  )
  const remoteTasks = remote.tasks
  const remoteReminders = remote.reminders

  useEffect(() => {
    const remoteIds = new Set(remoteTasks.map((task) => task.taskId))
    setPendingTasks((current) => current.filter((task) => !remoteIds.has(task.taskId)))
    setTaskPatches((current) => reconcilePatches(remoteTasks, current, (task) => task.taskId))
  }, [remoteTasks])

  useEffect(() => {
    const remoteIds = new Set(remoteReminders.map((reminder) => reminder.reminderId))
    setPendingReminders((current) => current.filter((reminder) => !remoteIds.has(reminder.reminderId)))
    setReminderPatches((current) => reconcilePatches(remoteReminders, current, (reminder) => reminder.reminderId))
  }, [remoteReminders])

  const tasks = useMemo(() => {
    const reconciled = reconcileEntities(remoteTasks, pendingTasks, (task) => task.taskId)
    return mergeOptimistic(reconciled, taskPatches, (task) => task.taskId).sort(
      (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)
        || a.taskId.localeCompare(b.taskId),
    )
  }, [pendingTasks, remoteTasks, taskPatches])

  const reminders = useMemo(() => {
    const reconciled = reconcileEntities(remoteReminders, pendingReminders, (reminder) => reminder.reminderId)
    return mergeOptimistic(reconciled, reminderPatches, (reminder) => reminder.reminderId).sort(
      (a, b) => a.remindAt - b.remindAt || a.reminderId.localeCompare(b.reminderId),
    )
  }, [pendingReminders, remoteReminders, reminderPatches])

  const activity = useMemo(
    () => deriveActivity(remote.activity),
    [remote.activity],
  )

  async function exclusive<T>(key: string, operation: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    const started = beginPending(pendingRef.current, key)
    if (!started.acquired) {
      return { ok: false, reason: 'invalid_state', message: 'That action is already in progress.' }
    }
    pendingRef.current = started.keys
    setPending(started.keys)
    try {
      return await operation()
    } finally {
      pendingRef.current = endPending(pendingRef.current, key)
      setPending(pendingRef.current)
    }
  }

  async function transition(
    key: string,
    operation: () => Promise<{ ok: true; revision?: number } | { ok: false; reason: string }>,
  ): Promise<ActionResult> {
    return exclusive(key, async () => {
      try {
        const result = await operation()
        if (!result.ok) return failure(result.reason)
        return { ok: true, value: undefined }
      } catch (error) {
        return failure('transport_error', error)
      }
    })
  }

  async function patchTask(
    task: TaskItem,
    patch: Partial<TaskItem>,
    operation: () => Promise<{ ok: true; revision: number } | { ok: false; reason: string }>,
  ): Promise<ActionResult> {
    const key = `task:${task.taskId}`
    if (pendingRef.current.has(key)) {
      return { ok: false, reason: 'invalid_state', message: 'That task action is already in progress.' }
    }
    setTaskPatches((current) => ({ ...current, [task.taskId]: { value: patch, baseRevision: task.revision } }))
    const result = await transition(key, operation)
    if (!result.ok) {
      setTaskPatches((current) => {
        const next = { ...current }
        delete next[task.taskId]
        return next
      })
    }
    return result
  }

  async function patchReminder(
    reminder: ReminderItem,
    patch: Partial<ReminderItem>,
    operation: () => Promise<{ ok: true; revision: number } | { ok: false; reason: string }>,
  ): Promise<ActionResult> {
    const key = `reminder:${reminder.reminderId}`
    if (pendingRef.current.has(key)) {
      return { ok: false, reason: 'invalid_state', message: 'That reminder action is already in progress.' }
    }
    setReminderPatches((current) => ({ ...current, [reminder.reminderId]: { value: patch, baseRevision: reminder.revision } }))
    const result = await transition(key, operation)
    if (!result.ok) {
      setReminderPatches((current) => {
        const next = { ...current }
        delete next[reminder.reminderId]
        return next
      })
    }
    return result
  }

  const repository: ClientRepository = {
    installation: remote.installation,
    tasks,
    reminders,
    activity,
    nodes: remote.nodes,
    runEvents: [...remote.runEvents].sort((a, b) => a.sequence - b.sequence),
    loading: remote.loading,
    loadingRunEvents: remote.loadingRunEvents,
    pending,
    pages: remote.pages,
    loadMore(name): void {
      if (name === 'openTasks' && openTasksPage.status === 'CanLoadMore') openTasksPage.loadMore(PAGE_SIZE)
      if (name === 'completedTasks' && completedTasksPage.status === 'CanLoadMore') completedTasksPage.loadMore(PAGE_SIZE)
      if (name === 'reminders') {
        if (scheduledRemindersPage.status === 'CanLoadMore') scheduledRemindersPage.loadMore(PAGE_SIZE)
        if (firedRemindersPage.status === 'CanLoadMore') firedRemindersPage.loadMore(PAGE_SIZE)
        if (dismissedRemindersPage.status === 'CanLoadMore') dismissedRemindersPage.loadMore(PAGE_SIZE)
      }
      if (name === 'activity' && activityPage.status === 'CanLoadMore') activityPage.loadMore(PAGE_SIZE)
      if (name === 'runEvents' && runEventsPage.status === 'CanLoadMore') runEventsPage.loadMore(50)
    },
    selectRun(): void {
      // Selection is owned by the consuming view; this method preserves the portable repository contract.
    },
    submitCommand(input): Promise<ActionResult<{ commandId: string }>> {
      return exclusive('command:create', async () => {
        const commandId = createClientId('command')
        try {
          await submitCommandMutation({
            installationId,
            commandId,
            idempotencyKey: createClientId('intent'),
            input,
            maxAttempts: 3,
          })
          return { ok: true, value: { commandId } }
        } catch (error) {
          return failure('transport_error', error)
        }
      })
    },
    cancelCommand(command): Promise<ActionResult> {
      return transition(`command:${command.commandId}`, () => cancelCommandMutation({
        installationId,
        commandId: command.commandId,
        expectedRevision: command.revision,
      }))
    },
    retryCommand(command, job): Promise<ActionResult> {
      if (job.attempt >= job.maxAttempts) return Promise.resolve(failure('attempts_exhausted'))
      return exclusive(`command:${command.commandId}`, async () => {
        try {
          const result = await retryCommandMutation({
            installationId,
            commandId: command.commandId,
            expectedCommandRevision: command.revision,
            expectedJobRevision: job.revision,
          })
          if (!result.ok) return failure(result.reason)
          return { ok: true, value: undefined }
        } catch (error) {
          return failure('transport_error', error)
        }
      })
    },
    createTask(input): Promise<ActionResult<TaskItem>> {
      return exclusive('task:create', async () => {
        const taskId = createClientId('task')
        const now = Date.now()
        const optimistic: TaskItem = { ...input, taskId, status: 'open', revision: 0, createdAt: now, updatedAt: now, optimistic: true }
        setPendingTasks((current) => [optimistic, ...current])
        try {
          const result = await createTaskMutation({
            installationId,
            taskId,
            idempotencyKey: createClientId('task-intent'),
            title: input.title,
            dueAt: input.dueAt,
            status: 'open',
          })
          return { ok: true, value: result.task as TaskItem }
        } catch (error) {
          setPendingTasks((current) => current.filter((task) => task.taskId !== taskId))
          return failure('transport_error', error)
        }
      })
    },
    updateTask(task, patch): Promise<ActionResult> {
      return patchTask(task, patch, () => updateTaskMutation({
        installationId,
        taskId: task.taskId,
        expectedRevision: task.revision,
        title: patch.title,
        dueAt: patch.dueAt,
        clearDueAt: patch.dueAt === undefined,
      }))
    },
    setTaskStatus(task, status: TaskStatus): Promise<ActionResult> {
      return patchTask(task, { status }, () => setTaskStatusMutation({
        installationId,
        taskId: task.taskId,
        expectedRevision: task.revision,
        status,
      }))
    },
    cancelTask(task): Promise<ActionResult> {
      return patchTask(task, { status: 'cancelled' }, () => tombstoneTaskMutation({
        installationId,
        taskId: task.taskId,
        expectedRevision: task.revision,
      }))
    },
    createReminder(input): Promise<ActionResult<ReminderItem>> {
      return exclusive('reminder:create', async () => {
        const reminderId = createClientId('reminder')
        const now = Date.now()
        const optimistic: ReminderItem = { ...input, reminderId, status: 'scheduled', revision: 0, createdAt: now, updatedAt: now, optimistic: true }
        setPendingReminders((current) => [...current, optimistic])
        try {
          const result = await createReminderMutation({
            installationId,
            reminderId,
            idempotencyKey: createClientId('reminder-intent'),
            message: input.message,
            remindAt: input.remindAt,
            timezone: input.timezone,
            status: 'scheduled',
          })
          return { ok: true, value: result.reminder as ReminderItem }
        } catch (error) {
          setPendingReminders((current) => current.filter((reminder) => reminder.reminderId !== reminderId))
          return failure('transport_error', error)
        }
      })
    },
    updateReminder(reminder, patch): Promise<ActionResult> {
      return patchReminder(reminder, patch, () => updateReminderMutation({
        installationId,
        reminderId: reminder.reminderId,
        expectedRevision: reminder.revision,
        message: patch.message,
        remindAt: patch.remindAt,
      }))
    },
    setReminderStatus(reminder, status: ReminderStatus): Promise<ActionResult> {
      return patchReminder(reminder, { status }, () => setReminderStatusMutation({
        installationId,
        reminderId: reminder.reminderId,
        expectedRevision: reminder.revision,
        status,
      }))
    },
    cancelReminder(reminder): Promise<ActionResult> {
      return patchReminder(reminder, { status: 'cancelled' }, () => tombstoneReminderMutation({
        installationId,
        reminderId: reminder.reminderId,
        expectedRevision: reminder.revision,
      }))
    },
  }

  return {
    repository,
    connectionMode,
    connectionRecoveryRequired: needsConnectionRecreate(connectionTracker),
  }
}
