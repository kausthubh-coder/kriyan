'use client'

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  useConvexConnectionState,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react'

import { api } from '@convex/_generated/api'
import type { KriyanWebConfiguration } from '@/lib/convex'

import {
  deriveConnectionMode,
  INITIAL_CONNECTION_TRACKER,
  updateConnectionTracker,
} from './connection'
import {
  mergeOptimistic,
  normalizeTransitionReason,
  reconcileEntities,
  reconcilePatches,
  type EntityPatch,
} from './optimistic'
import { createClientId, SUBSCRIPTIONS, type ClientRepository } from './repository'
import type {
  ActionResult,
  CommandItem,
  ConnectionMode,
  JobItem,
  PageState,
  ReminderItem,
  ReminderStatus,
  RunEventItem,
  RunItem,
  TaskItem,
  TaskStatus,
} from './types'
import { conflictMessage } from './view-model'

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
}

export function useConvexRepository(
  configuration: KriyanWebConfiguration,
  selectedRunId: string | null,
): ConvexRepositoryResult {
  const { installationId } = configuration
  const connection = useConvexConnectionState()
  const initialSocketConnected = useRef(connection.isWebSocketConnected)
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
  const openTasksPage = usePaginatedQuery(
    api.projections.listTasks,
    { installationId, status: 'open', includeDeleted: false },
    { initialNumItems: SUBSCRIPTIONS.openTasks.pageSize },
  )
  const completedTasksPage = usePaginatedQuery(
    api.projections.listTasks,
    { installationId, status: 'completed', includeDeleted: false },
    { initialNumItems: SUBSCRIPTIONS.completedTasks.pageSize },
  )
  const scheduledRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'scheduled', includeDeleted: false },
    { initialNumItems: SUBSCRIPTIONS.scheduledReminders.pageSize },
  )
  const firedRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'fired', includeDeleted: false },
    { initialNumItems: SUBSCRIPTIONS.recentReminders.pageSize },
  )
  const dismissedRemindersPage = usePaginatedQuery(
    api.projections.listReminders,
    { installationId, status: 'dismissed', includeDeleted: false },
    { initialNumItems: SUBSCRIPTIONS.recentReminders.pageSize },
  )
  const commandsPage = usePaginatedQuery(
    api.commands.list,
    { installationId },
    { initialNumItems: SUBSCRIPTIONS.commands.pageSize },
  )
  const jobsPage = usePaginatedQuery(
    api.read.jobs,
    { installationId },
    { initialNumItems: SUBSCRIPTIONS.jobs.pageSize },
  )
  const runsPage = usePaginatedQuery(
    api.read.runs,
    { installationId },
    { initialNumItems: SUBSCRIPTIONS.runs.pageSize },
  )
  const nodesPage = usePaginatedQuery(
    api.read.nodes,
    { installationId },
    { initialNumItems: SUBSCRIPTIONS.nodes.pageSize },
  )
  const runEventsPage = usePaginatedQuery(
    api.read.runEvents,
    selectedRunId ? { installationId, runId: selectedRunId } : 'skip',
    { initialNumItems: SUBSCRIPTIONS.runEvents.pageSize },
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
      socketConnected: initialSocketConnected.current,
    })
    const online = (): void => dispatchConnection({ type: 'online' })
    const offline = (): void => dispatchConnection({ type: 'offline' })
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  useEffect(() => {
    dispatchConnection({ type: 'socket', connected: connection.isWebSocketConnected })
  }, [connection.isWebSocketConnected])

  const remoteTasks = useMemo(
    () => [...openTasksPage.results, ...completedTasksPage.results] as TaskItem[],
    [completedTasksPage.results, openTasksPage.results],
  )
  const remoteReminders = useMemo(
    () => [
      ...scheduledRemindersPage.results,
      ...firedRemindersPage.results,
      ...dismissedRemindersPage.results,
    ] as ReminderItem[],
    [dismissedRemindersPage.results, firedRemindersPage.results, scheduledRemindersPage.results],
  )

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

  async function exclusive<T>(key: string, operation: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    if (pendingRef.current.has(key)) {
      return { ok: false, reason: 'invalid_state', message: 'That action is already in progress.' }
    }
    pendingRef.current.add(key)
    setPending(new Set(pendingRef.current))
    try {
      return await operation()
    } finally {
      pendingRef.current.delete(key)
      setPending(new Set(pendingRef.current))
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
    installation,
    tasks,
    reminders,
    commands: [...commandsPage.results as CommandItem[]].sort(
      (a, b) => b.createdAt - a.createdAt || a.commandId.localeCompare(b.commandId),
    ),
    jobs: jobsPage.results as JobItem[],
    runs: runsPage.results as RunItem[],
    nodes: nodesPage.results,
    runEvents: [...runEventsPage.results as RunEventItem[]].sort((a, b) => a.sequence - b.sequence),
    loading: [
      openTasksPage.status,
      completedTasksPage.status,
      scheduledRemindersPage.status,
      firedRemindersPage.status,
      dismissedRemindersPage.status,
      commandsPage.status,
      jobsPage.status,
      runsPage.status,
      nodesPage.status,
    ].some((status) => status === 'LoadingFirstPage'),
    loadingRunEvents: runEventsPage.status === 'LoadingFirstPage',
    pending,
    pages: {
      openTasks: pageState(openTasksPage.status, openTasksPage.results.length),
      completedTasks: pageState(completedTasksPage.status, completedTasksPage.results.length),
      reminders: {
        canLoadMore: [scheduledRemindersPage, firedRemindersPage, dismissedRemindersPage]
          .some((page) => page.status === 'CanLoadMore'),
        loadingMore: [scheduledRemindersPage, firedRemindersPage, dismissedRemindersPage]
          .some((page) => page.status === 'LoadingMore'),
        loadedCount: remoteReminders.length,
      },
      activity: {
        canLoadMore: [commandsPage, jobsPage, runsPage, nodesPage].some((page) => page.status === 'CanLoadMore'),
        loadingMore: [commandsPage, jobsPage, runsPage, nodesPage].some((page) => page.status === 'LoadingMore'),
        loadedCount: commandsPage.results.length,
      },
      runEvents: pageState(runEventsPage.status, runEventsPage.results.length),
    },
    loadMore(name): void {
      if (name === 'openTasks' && openTasksPage.status === 'CanLoadMore') openTasksPage.loadMore(SUBSCRIPTIONS.openTasks.pageSize)
      if (name === 'completedTasks' && completedTasksPage.status === 'CanLoadMore') completedTasksPage.loadMore(SUBSCRIPTIONS.completedTasks.pageSize)
      if (name === 'reminders') {
        if (scheduledRemindersPage.status === 'CanLoadMore') scheduledRemindersPage.loadMore(SUBSCRIPTIONS.scheduledReminders.pageSize)
        if (firedRemindersPage.status === 'CanLoadMore') firedRemindersPage.loadMore(SUBSCRIPTIONS.recentReminders.pageSize)
        if (dismissedRemindersPage.status === 'CanLoadMore') dismissedRemindersPage.loadMore(SUBSCRIPTIONS.recentReminders.pageSize)
      }
      if (name === 'activity') {
        if (commandsPage.status === 'CanLoadMore') commandsPage.loadMore(SUBSCRIPTIONS.commands.pageSize)
        if (jobsPage.status === 'CanLoadMore') jobsPage.loadMore(SUBSCRIPTIONS.jobs.pageSize)
        if (runsPage.status === 'CanLoadMore') runsPage.loadMore(SUBSCRIPTIONS.runs.pageSize)
        if (nodesPage.status === 'CanLoadMore') nodesPage.loadMore(SUBSCRIPTIONS.nodes.pageSize)
      }
      if (name === 'runEvents' && runEventsPage.status === 'CanLoadMore') runEventsPage.loadMore(SUBSCRIPTIONS.runEvents.pageSize)
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

  return { repository, connectionMode: deriveConnectionMode(connectionTracker) }
}
