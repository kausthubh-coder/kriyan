'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import { INSTALLATION_ID } from '@/lib/convex'
import {
  deriveConnectionMode,
  mergeOptimistic,
  reconcilePatches,
} from '@/src/client-core/optimistic'
import { createClientId } from '@/src/client-core/repository'
import type {
  CommandItem,
  ConnectionMode,
  JobItem,
  NodeItem,
  ReminderItem,
  RunEventItem,
  RunItem,
  TaskItem,
  TodaySnapshot,
} from '@/src/client-core/types'
import {
  conflictMessage,
  deriveActivity,
  formatRelativeTime,
  isNodeAvailable,
  type ActivityItem,
} from '@/src/client-core/view-model'

import {
  ActivityIcon,
  BellIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  EditIcon,
  NodeIcon,
  PlusIcon,
  RetryIcon,
  SendIcon,
  TaskIcon,
  TodayIcon,
} from './icons'

type Section = 'today' | 'tasks' | 'reminders'
type OptimisticPatch<T> = { value: Partial<T>; baseRevision: number }

const PAGE = { numItems: 100, cursor: null }
const CURRENT_DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date())

const NAV_ITEMS: Array<{ key: Section; label: string; href: string; icon: typeof TodayIcon }> = [
  { key: 'today', label: 'Today', href: '/', icon: TodayIcon },
  { key: 'tasks', label: 'Tasks', href: '/tasks', icon: TaskIcon },
  { key: 'reminders', label: 'Reminders', href: '/reminders', icon: BellIcon },
]

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function eventData(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object') {
      const value = parsed as Record<string, unknown>
      for (const key of ['message', 'status', 'tool', 'text']) {
        if (typeof value[key] === 'string') return value[key]
      }
    }
  } catch {
    // Raw event data is valid display content.
  }
  return data || 'Event received'
}

export function TodayApp({ initialSection }: { initialSection: Section }) {
  const connection = useConvexConnectionState()
  const [browserOnline, setBrowserOnline] = useState(true)
  const [hasConnected, setHasConnected] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [composer, setComposer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([])
  const [pendingReminders, setPendingReminders] = useState<ReminderItem[]>([])
  const [taskPatches, setTaskPatches] = useState<Record<string, OptimisticPatch<TaskItem>>>({})
  const [reminderPatches, setReminderPatches] = useState<Record<string, OptimisticPatch<ReminderItem>>>({})
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const provisionAttempted = useRef(false)

  const installation = useQuery(api.installations.get, { installationId: INSTALLATION_ID })
  const taskPage = useQuery(api.projections.listTasks, {
    installationId: INSTALLATION_ID,
    includeDeleted: false,
    paginationOpts: PAGE,
  })
  const reminderPage = useQuery(api.projections.listReminders, {
    installationId: INSTALLATION_ID,
    includeDeleted: false,
    paginationOpts: PAGE,
  })
  const commandPage = useQuery(api.commands.list, { installationId: INSTALLATION_ID, paginationOpts: PAGE })
  const jobPage = useQuery(api.read.jobs, { installationId: INSTALLATION_ID, paginationOpts: PAGE })
  const runPage = useQuery(api.read.runs, { installationId: INSTALLATION_ID, paginationOpts: PAGE })
  const nodePage = useQuery(api.read.nodes, { installationId: INSTALLATION_ID, paginationOpts: PAGE })

  const createInstallation = useMutation(api.installations.create)
  const submitCommand = useMutation(api.commands.submit)
  const cancelCommand = useMutation(api.commands.cancel)
  const retryCommand = useMutation(api.commands.retry)
  const createTask = useMutation(api.projections.createTask)
  const updateTask = useMutation(api.projections.updateTask)
  const setTaskStatus = useMutation(api.projections.setTaskStatus)
  const tombstoneTask = useMutation(api.projections.tombstoneTask)
  const createReminder = useMutation(api.projections.createReminder)
  const updateReminder = useMutation(api.projections.updateReminder)
  const setReminderStatus = useMutation(api.projections.setReminderStatus)
  const tombstoneReminder = useMutation(api.projections.tombstoneReminder)

  useEffect(() => {
    setBrowserOnline(navigator.onLine)
    const online = () => setBrowserOnline(true)
    const offline = () => setBrowserOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  useEffect(() => {
    if (connection.isWebSocketConnected) setHasConnected(true)
  }, [connection.isWebSocketConnected])

  useEffect(() => {
    if (installation !== null || provisionAttempted.current) return
    provisionAttempted.current = true
    void createInstallation({
      installationId: INSTALLATION_ID,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      protocolVersion: '1',
    }).catch((error: unknown) => {
      provisionAttempted.current = false
      setNotice({ tone: 'error', text: `Could not prepare this installation: ${asMessage(error)}` })
    })
  }, [createInstallation, installation])

  const remoteTasks = useMemo(() => (taskPage?.page ?? []) as TaskItem[], [taskPage?.page])
  const remoteReminders = useMemo(() => (reminderPage?.page ?? []) as ReminderItem[], [reminderPage?.page])

  useEffect(() => {
    if (pendingTasks.length > 0) {
      const remoteIds = new Set(remoteTasks.map((task) => task.taskId))
      setPendingTasks((current) => current.filter((task) => !remoteIds.has(task.taskId)))
    }
    setTaskPatches((current) => {
      const next = reconcilePatches(remoteTasks, current, (task) => task.taskId)
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [pendingTasks.length, remoteTasks])

  useEffect(() => {
    if (pendingReminders.length > 0) {
      const remoteIds = new Set(remoteReminders.map((reminder) => reminder.reminderId))
      setPendingReminders((current) => current.filter((reminder) => !remoteIds.has(reminder.reminderId)))
    }
    setReminderPatches((current) => {
      const next = reconcilePatches(remoteReminders, current, (reminder) => reminder.reminderId)
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [pendingReminders.length, remoteReminders])

  const tasks = useMemo(() => {
    const merged = mergeOptimistic(remoteTasks, taskPatches, (task) => task.taskId)
    return [...pendingTasks, ...merged].sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
  }, [pendingTasks, remoteTasks, taskPatches])

  const reminders = useMemo(() => {
    const merged = mergeOptimistic(remoteReminders, reminderPatches, (reminder) => reminder.reminderId)
    return [...pendingReminders, ...merged].sort((a, b) => a.remindAt - b.remindAt)
  }, [pendingReminders, remoteReminders, reminderPatches])

  const snapshot: TodaySnapshot = useMemo(() => ({
    tasks,
    reminders,
    commands: (commandPage?.page ?? []) as CommandItem[],
    jobs: (jobPage?.page ?? []) as JobItem[],
    runs: (runPage?.page ?? []) as RunItem[],
    nodes: (nodePage?.page ?? []) as NodeItem[],
  }), [commandPage?.page, jobPage?.page, nodePage?.page, reminders, runPage?.page, tasks])

  const activity = useMemo(() => deriveActivity(snapshot), [snapshot])
  const selectedActivity = activity.find((item) => item.command.commandId === selectedCommandId) ?? activity[0]
  const runEventsPage = useQuery(
    api.read.runEvents,
    selectedActivity?.run
      ? { installationId: INSTALLATION_ID, runId: selectedActivity.run.runId, paginationOpts: PAGE }
      : 'skip',
  )
  const runEvents = (runEventsPage?.page ?? []) as RunEventItem[]

  const connectionMode: ConnectionMode = deriveConnectionMode(
    browserOnline,
    connection.isWebSocketConnected,
    hasConnected,
  )
  const liveNodes = snapshot.nodes.filter((node) => isNodeAvailable(node))
  const loading = [taskPage, reminderPage, commandPage, jobPage, runPage, nodePage].some((value) => value === undefined)

  async function onSubmitCommand(): Promise<void> {
    const input = composer.trim()
    if (!input || submitting) return
    setSubmitting(true)
    setNotice(null)
    const commandId = createClientId('command')
    try {
      await submitCommand({
        installationId: INSTALLATION_ID,
        commandId,
        idempotencyKey: createClientId('intent'),
        input,
        maxAttempts: 3,
      })
      setComposer('')
      setSelectedCommandId(commandId)
      setNotice({
        tone: 'success',
        text: liveNodes.length > 0 ? 'Command queued. Live activity will update as the node handles it.' : 'Command queued. It will remain queued until a node is online.',
      })
    } catch (error) {
      setNotice({ tone: 'error', text: `Command was not queued: ${asMessage(error)}` })
    } finally {
      setSubmitting(false)
    }
  }

  async function onCreateTask(title: string, dueAt?: number): Promise<boolean> {
    const taskId = createClientId('task')
    const now = Date.now()
    const optimistic: TaskItem = { taskId, title, dueAt, status: 'open', revision: 0, createdAt: now, updatedAt: now, optimistic: true }
    setPendingTasks((current) => [optimistic, ...current])
    try {
      await createTask({ installationId: INSTALLATION_ID, taskId, idempotencyKey: createClientId('task-intent'), title, dueAt, status: 'open' })
      return true
    } catch (error) {
      setPendingTasks((current) => current.filter((task) => task.taskId !== taskId))
      setNotice({ tone: 'error', text: `Task was rolled back: ${asMessage(error)}` })
      return false
    }
  }

  async function onPatchTask(task: TaskItem, patch: Partial<TaskItem>, operation: () => Promise<{ ok: boolean; reason?: string }>): Promise<void> {
    setTaskPatches((current) => ({ ...current, [task.taskId]: { value: patch, baseRevision: task.revision } }))
    try {
      const result = await operation()
      if (!result.ok) throw new Error(result.reason ?? 'invalid_state')
    } catch (error) {
      setTaskPatches((current) => {
        const next = { ...current }
        delete next[task.taskId]
        return next
      })
      const reason = asMessage(error)
      setNotice({ tone: 'error', text: reason.includes('stale_revision') ? conflictMessage('stale_revision') : conflictMessage(reason) })
    }
  }

  async function onCreateReminder(message: string, remindAt: number): Promise<boolean> {
    const reminderId = createClientId('reminder')
    const now = Date.now()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const optimistic: ReminderItem = { reminderId, message, remindAt, timezone, status: 'scheduled', revision: 0, createdAt: now, updatedAt: now, optimistic: true }
    setPendingReminders((current) => [...current, optimistic])
    try {
      await createReminder({ installationId: INSTALLATION_ID, reminderId, idempotencyKey: createClientId('reminder-intent'), message, remindAt, timezone, status: 'scheduled' })
      return true
    } catch (error) {
      setPendingReminders((current) => current.filter((reminder) => reminder.reminderId !== reminderId))
      setNotice({ tone: 'error', text: `Reminder was rolled back: ${asMessage(error)}` })
      return false
    }
  }

  async function onPatchReminder(reminder: ReminderItem, patch: Partial<ReminderItem>, operation: () => Promise<{ ok: boolean; reason?: string }>): Promise<void> {
    setReminderPatches((current) => ({ ...current, [reminder.reminderId]: { value: patch, baseRevision: reminder.revision } }))
    try {
      const result = await operation()
      if (!result.ok) throw new Error(result.reason ?? 'invalid_state')
    } catch (error) {
      setReminderPatches((current) => {
        const next = { ...current }
        delete next[reminder.reminderId]
        return next
      })
      const reason = asMessage(error)
      setNotice({ tone: 'error', text: reason.includes('stale_revision') ? conflictMessage('stale_revision') : conflictMessage(reason) })
    }
  }

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <Brand connectionMode={connectionMode} />
        <nav className="primary-nav">
          {NAV_ITEMS.map((item) => <NavItem key={item.key} item={item} active={item.key === initialSection} />)}
        </nav>
        <NodeSummary nodes={snapshot.nodes} liveNodes={liveNodes} />
      </aside>

      <header className="mobile-header">
        <Brand connectionMode={connectionMode} compact />
        <NodeSummary nodes={snapshot.nodes} liveNodes={liveNodes} compact />
      </header>

      <main className="main-content" id="main-content">
        <PageHeader section={initialSection} />
        {connectionMode !== 'online' && <ConnectionBanner mode={connectionMode} />}
        {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}

        {initialSection === 'today' && (
          <>
            <CommandComposer value={composer} onChange={setComposer} onSubmit={onSubmitCommand} busy={submitting} nodeOnline={liveNodes.length > 0} />
            <TodayOverview
              loading={loading}
              tasks={tasks}
              reminders={reminders}
              activity={activity}
              onToggleTask={(task) => onPatchTask(task, { status: task.status === 'completed' ? 'open' : 'completed' }, () => setTaskStatus({ installationId: INSTALLATION_ID, taskId: task.taskId, expectedRevision: task.revision, status: task.status === 'completed' ? 'open' : 'completed' }))}
              onSelectActivity={(item) => setSelectedCommandId(item.command.commandId)}
            />
          </>
        )}

        {initialSection === 'tasks' && (
          <TaskWorkspace
            loading={loading}
            tasks={tasks}
            onCreate={onCreateTask}
            onToggle={(task) => onPatchTask(task, { status: task.status === 'completed' ? 'open' : 'completed' }, () => setTaskStatus({ installationId: INSTALLATION_ID, taskId: task.taskId, expectedRevision: task.revision, status: task.status === 'completed' ? 'open' : 'completed' }))}
            onUpdate={(task, title, dueAt) => onPatchTask(task, { title, dueAt }, () => updateTask({ installationId: INSTALLATION_ID, taskId: task.taskId, expectedRevision: task.revision, title, dueAt, clearDueAt: dueAt === undefined }))}
            onCancel={(task) => onPatchTask(task, { status: 'cancelled' }, () => tombstoneTask({ installationId: INSTALLATION_ID, taskId: task.taskId, expectedRevision: task.revision }))}
          />
        )}

        {initialSection === 'reminders' && (
          <ReminderWorkspace
            loading={loading}
            reminders={reminders}
            onCreate={onCreateReminder}
            onUpdate={(reminder, message, remindAt) => onPatchReminder(reminder, { message, remindAt }, () => updateReminder({ installationId: INSTALLATION_ID, reminderId: reminder.reminderId, expectedRevision: reminder.revision, message, remindAt }))}
            onDismiss={(reminder) => onPatchReminder(reminder, { status: 'dismissed' }, () => setReminderStatus({ installationId: INSTALLATION_ID, reminderId: reminder.reminderId, expectedRevision: reminder.revision, status: 'dismissed' }))}
            onCancel={(reminder) => onPatchReminder(reminder, { status: 'cancelled' }, () => tombstoneReminder({ installationId: INSTALLATION_ID, reminderId: reminder.reminderId, expectedRevision: reminder.revision }))}
          />
        )}
      </main>

      <aside className="activity-rail" aria-label="Run activity">
        <ActivityPanel
          activity={activity}
          selected={selectedActivity}
          events={runEvents}
          loadingEvents={Boolean(selectedActivity?.run && runEventsPage === undefined)}
          nodeOnline={liveNodes.length > 0}
          onSelect={(item) => setSelectedCommandId(item.command.commandId)}
          onCancel={async (item) => {
            try {
              const result = await cancelCommand({ installationId: INSTALLATION_ID, commandId: item.command.commandId, expectedRevision: item.command.revision })
              if (!result.ok) setNotice({ tone: 'error', text: conflictMessage(result.reason) })
            } catch (error) { setNotice({ tone: 'error', text: asMessage(error) }) }
          }}
          onRetry={async (item) => {
            if (!item.job) return
            try {
              const result = await retryCommand({ installationId: INSTALLATION_ID, commandId: item.command.commandId, expectedCommandRevision: item.command.revision, expectedJobRevision: item.job.revision })
              if (!result.ok) setNotice({ tone: 'error', text: conflictMessage(result.reason) })
            } catch (error) { setNotice({ tone: 'error', text: asMessage(error) }) }
          }}
        />
      </aside>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => <NavItem key={item.key} item={item} active={item.key === initialSection} />)}
      </nav>
    </div>
  )
}

function Brand({ connectionMode, compact = false }: { connectionMode: ConnectionMode; compact?: boolean }) {
  return <div className={compact ? 'brand brand-compact' : 'brand'}><div className="brand-mark">K</div><div><strong>Kriyan</strong>{!compact && <span>Personal agent</span>}</div><span className={`connection-dot ${connectionMode}`} title={`Connection: ${connectionMode}`} /></div>
}

function NavItem({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon
  return <Link href={item.href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><Icon /><span>{item.label}</span></Link>
}

function NodeSummary({ nodes, liveNodes, compact = false }: { nodes: NodeItem[]; liveNodes: NodeItem[]; compact?: boolean }) {
  const live = liveNodes[0]
  const label = live ? live.displayName : nodes.length > 0 ? 'Node offline' : 'No node paired'
  return <div className={compact ? 'node-summary compact' : 'node-summary'}><NodeIcon /><div><strong>{label}</strong>{!compact && <span>{live ? `Heartbeat ${formatRelativeTime(live.lastHeartbeatAt)}` : 'Commands will wait safely'}</span>}</div><span className={`status-dot ${live ? 'online' : 'offline'}`} /></div>
}

function PageHeader({ section }: { section: Section }) {
  const copy = {
    today: ['Today', 'See what needs you, what is scheduled, and what Kriyan is doing.'],
    tasks: ['Tasks', 'Keep the next actions small, current, and visible.'],
    reminders: ['Reminders', 'Time-bound intentions, synchronized through your installation.'],
  }[section]
  return <header className="page-header"><p>{CURRENT_DATE_LABEL}</p><h1>{copy[0]}</h1><span>{copy[1]}</span></header>
}

function ConnectionBanner({ mode }: { mode: ConnectionMode }) {
  const copy = mode === 'offline' ? 'You are offline. Live changes are paused; unsent changes will show an error instead of pretending to save.' : mode === 'reconnecting' ? 'Reconnecting to Kriyan. Existing data stays visible while live updates resume.' : 'Connecting to your Kriyan installation…'
  return <div className={`connection-banner ${mode}`} role="status"><span className="status-dot" />{copy}</div>
}

function Notice({ notice, onClose }: { notice: { tone: 'error' | 'success'; text: string }; onClose: () => void }) {
  return <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button className="icon-button" onClick={onClose} aria-label="Dismiss message"><CloseIcon /></button></div>
}

function CommandComposer({ value, onChange, onSubmit, busy, nodeOnline }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean; nodeOnline: boolean }) {
  return <section className="composer" aria-labelledby="composer-title"><div><h2 id="composer-title">What should Kriyan handle?</h2><span>{nodeOnline ? 'Your node is ready.' : 'No node is online. New commands will wait in the queue.'}</span></div><div className="composer-control"><textarea value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit() } }} rows={2} maxLength={8192} placeholder="remind me tomorrow at 8 to practice Korean" aria-describedby="composer-help"/><button className="primary-button send-button" onClick={onSubmit} disabled={!value.trim() || busy} aria-label="Queue command">{busy ? <span className="spinner" /> : <SendIcon />}</button></div><p id="composer-help">Enter to queue · Shift + Enter for a new line</p></section>
}

function TodayOverview({ loading, tasks, reminders, activity, onToggleTask, onSelectActivity }: { loading: boolean; tasks: TaskItem[]; reminders: ReminderItem[]; activity: ActivityItem[]; onToggleTask: (task: TaskItem) => void; onSelectActivity: (item: ActivityItem) => void }) {
  const openTasks = tasks.filter((task) => task.status === 'open').slice(0, 5)
  const scheduled = reminders.filter((reminder) => reminder.status === 'scheduled').slice(0, 4)
  return <div className="today-grid"><section className="content-section"><SectionHeading title="Next actions" href="/tasks" count={openTasks.length} />{loading ? <SkeletonList /> : openTasks.length === 0 ? <EmptyState icon={CheckIcon} title="Nothing is pressing" body="Add a task when you know the next concrete action." href="/tasks" action="Add a task" /> : <div className="ruled-list">{openTasks.map((task) => <TaskRow key={task.taskId} task={task} compact onToggle={onToggleTask} />)}</div>}</section><section className="content-section"><SectionHeading title="Coming up" href="/reminders" count={scheduled.length} />{loading ? <SkeletonList rows={2} /> : scheduled.length === 0 ? <EmptyState icon={BellIcon} title="No reminders scheduled" body="Ask Kriyan or schedule one directly." href="/reminders" action="Schedule reminder" /> : <div className="ruled-list">{scheduled.map((reminder) => <ReminderRow key={reminder.reminderId} reminder={reminder} compact />)}</div>}</section><section className="content-section mobile-activity"><SectionHeading title="Live activity" count={activity.length} />{activity.length === 0 ? <EmptyState icon={ActivityIcon} title="No activity yet" body="Queued commands and node runs will appear here." /> : <div className="ruled-list">{activity.slice(0, 4).map((item) => <ActivityRow key={item.command.commandId} item={item} onClick={() => onSelectActivity(item)} />)}</div>}</section></div>
}

function SectionHeading({ title, count, href }: { title: string; count: number; href?: string }) {
  return <div className="section-heading"><h2>{title}</h2><div><span>{count}</span>{href && <Link href={href}>View all <ChevronIcon /></Link>}</div></div>
}

function SkeletonList({ rows = 3 }: { rows?: number }) { return <div className="skeleton-list" aria-label="Loading">{Array.from({ length: rows }, (_, index) => <div key={index}><i/><span/></div>)}</div> }

function EmptyState({ icon: Icon, title, body, href, action }: { icon: typeof CheckIcon; title: string; body: string; href?: string; action?: string }) {
  return <div className="empty-state"><Icon /><div><strong>{title}</strong><span>{body}</span></div>{href && action && <Link className="quiet-button" href={href}>{action}</Link>}</div>
}

function TaskWorkspace({ loading, tasks, onCreate, onToggle, onUpdate, onCancel }: { loading: boolean; tasks: TaskItem[]; onCreate: (title: string, dueAt?: number) => Promise<boolean>; onToggle: (task: TaskItem) => void; onUpdate: (task: TaskItem, title: string, dueAt?: number) => void; onCancel: (task: TaskItem) => void }) {
  const [showCompleted, setShowCompleted] = useState(false)
  const visible = tasks.filter((task) => task.status === (showCompleted ? 'completed' : 'open'))
  return <section className="workspace"><CreateTaskForm onCreate={onCreate}/><div className="workspace-toolbar"><div className="segmented-control"><button className={!showCompleted ? 'active' : ''} onClick={() => setShowCompleted(false)}>Open</button><button className={showCompleted ? 'active' : ''} onClick={() => setShowCompleted(true)}>Completed</button></div><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}</span></div>{loading ? <SkeletonList rows={5}/> : visible.length === 0 ? <EmptyState icon={TaskIcon} title={showCompleted ? 'No completed tasks yet' : 'Your task list is clear'} body={showCompleted ? 'Completed work will stay available here.' : 'Capture the smallest useful next action above.'}/> : <div className="ruled-list workspace-list">{visible.map((task) => <TaskRow key={task.taskId} task={task} onToggle={onToggle} onUpdate={onUpdate} onCancel={onCancel}/>)}</div>}</section>
}

function CreateTaskForm({ onCreate }: { onCreate: (title: string, dueAt?: number) => Promise<boolean> }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="inline-create" onSubmit={async (event) => { event.preventDefault(); if (!title.trim()) return; setBusy(true); const ok = await onCreate(title.trim(), due ? new Date(`${due}T17:00`).getTime() : undefined); if (ok) { setTitle(''); setDue('') } setBusy(false) }}><label><span>New task</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write the next concrete action" maxLength={1024}/></label><label className="date-field"><span>Due</span><input type="date" value={due} onChange={(event) => setDue(event.target.value)}/></label><button className="primary-button" disabled={!title.trim() || busy}>{busy ? 'Adding…' : <><PlusIcon/>Add task</>}</button></form>
}

export function TaskRow({ task, compact = false, onToggle = () => {}, onUpdate, onCancel }: { task: TaskItem; compact?: boolean; onToggle?: (task: TaskItem) => void; onUpdate?: (task: TaskItem, title: string, dueAt?: number) => void; onCancel?: (task: TaskItem) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : '')
  if (editing && onUpdate) return <form className="edit-row" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onUpdate(task, title.trim(), due ? new Date(`${due}T17:00`).getTime() : undefined); setEditing(false) }}><input aria-label="Task title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus/><input aria-label="Due date" type="date" value={due} onChange={(event) => setDue(event.target.value)}/><button className="quiet-button" type="submit">Save</button><button className="icon-button" type="button" aria-label="Cancel editing" onClick={() => setEditing(false)}><CloseIcon/></button></form>
  return <div className={`task-row ${task.status === 'completed' ? 'completed' : ''} ${task.optimistic ? 'optimistic' : ''}`}><button className="task-check" onClick={() => onToggle(task)} aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={task.optimistic}>{task.status === 'completed' && <CheckIcon/>}</button><div><strong>{task.title}</strong><span>{task.optimistic ? 'Saving…' : task.dueAt ? formatRelativeTime(task.dueAt) : 'No due date'}</span></div>{!compact && <div className="row-actions"><button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => setEditing(true)}><EditIcon/></button><button className="icon-button danger" aria-label={`Cancel ${task.title}`} onClick={() => onCancel?.(task)}><CloseIcon/></button></div>}</div>
}

function ReminderWorkspace({ loading, reminders, onCreate, onUpdate, onDismiss, onCancel }: { loading: boolean; reminders: ReminderItem[]; onCreate: (message: string, remindAt: number) => Promise<boolean>; onUpdate: (reminder: ReminderItem, message: string, remindAt: number) => void; onDismiss: (reminder: ReminderItem) => void; onCancel: (reminder: ReminderItem) => void }) {
  const visible = reminders.filter((reminder) => reminder.status !== 'cancelled')
  return <section className="workspace"><CreateReminderForm onCreate={onCreate}/><div className="workspace-toolbar"><strong>Scheduled and recent</strong><span>{visible.length} {visible.length === 1 ? 'reminder' : 'reminders'}</span></div>{loading ? <SkeletonList rows={4}/> : visible.length === 0 ? <EmptyState icon={BellIcon} title="Nothing scheduled" body="Add a specific time so Kriyan can keep the intention durable."/> : <div className="ruled-list workspace-list">{visible.map((reminder) => <ReminderRow key={reminder.reminderId} reminder={reminder} onUpdate={onUpdate} onDismiss={onDismiss} onCancel={onCancel}/>)}</div>}</section>
}

function nextHourLocal(): string { const date = new Date(Date.now() + 3_600_000); date.setMinutes(0, 0, 0); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16) }

function CreateReminderForm({ onCreate }: { onCreate: (message: string, remindAt: number) => Promise<boolean> }) {
  const [message, setMessage] = useState('')
  const [when, setWhen] = useState(nextHourLocal)
  const [busy, setBusy] = useState(false)
  return <form className="inline-create reminder-create" onSubmit={async (event) => { event.preventDefault(); const remindAt = new Date(when).getTime(); if (!message.trim() || !Number.isFinite(remindAt)) return; setBusy(true); const ok = await onCreate(message.trim(), remindAt); if (ok) { setMessage(''); setWhen(nextHourLocal()) } setBusy(false) }}><label><span>New reminder</span><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Practice Korean" maxLength={4096}/></label><label className="datetime-field"><span>When</span><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)}/></label><button className="primary-button" disabled={!message.trim() || !when || busy}>{busy ? 'Scheduling…' : <><PlusIcon/>Schedule</>}</button></form>
}

export function ReminderRow({ reminder, compact = false, onUpdate, onDismiss, onCancel }: { reminder: ReminderItem; compact?: boolean; onUpdate?: (reminder: ReminderItem, message: string, remindAt: number) => void; onDismiss?: (reminder: ReminderItem) => void; onCancel?: (reminder: ReminderItem) => void }) {
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(reminder.message)
  const offset = new Date(reminder.remindAt).getTimezoneOffset() * 60_000
  const [when, setWhen] = useState(new Date(reminder.remindAt - offset).toISOString().slice(0, 16))
  if (editing && onUpdate) return <form className="edit-row" onSubmit={(event) => { event.preventDefault(); const remindAt = new Date(when).getTime(); if (!message.trim() || !Number.isFinite(remindAt)) return; onUpdate(reminder, message.trim(), remindAt); setEditing(false) }}><input aria-label="Reminder message" value={message} onChange={(event) => setMessage(event.target.value)} autoFocus/><input aria-label="Reminder time" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)}/><button className="quiet-button" type="submit">Save</button><button className="icon-button" type="button" aria-label="Cancel editing" onClick={() => setEditing(false)}><CloseIcon/></button></form>
  return <div className={`reminder-row ${reminder.optimistic ? 'optimistic' : ''}`}><div className="reminder-time"><strong>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(reminder.remindAt)}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(reminder.remindAt)}</span></div><div><strong>{reminder.message}</strong><span>{reminder.optimistic ? 'Saving…' : `${formatRelativeTime(reminder.remindAt)} · ${reminder.status}`}</span></div>{!compact && <div className="row-actions"><button className="quiet-button" onClick={() => onDismiss?.(reminder)} disabled={reminder.status === 'dismissed'}>Dismiss</button><button className="icon-button" aria-label={`Edit ${reminder.message}`} onClick={() => setEditing(true)}><EditIcon/></button><button className="icon-button danger" aria-label={`Cancel ${reminder.message}`} onClick={() => onCancel?.(reminder)}><CloseIcon/></button></div>}</div>
}

function ActivityPanel({ activity, selected, events, loadingEvents, nodeOnline, onSelect, onCancel, onRetry }: { activity: ActivityItem[]; selected?: ActivityItem; events: RunEventItem[]; loadingEvents: boolean; nodeOnline: boolean; onSelect: (item: ActivityItem) => void; onCancel: (item: ActivityItem) => void; onRetry: (item: ActivityItem) => void }) {
  return <div className="activity-panel"><div className="activity-header"><div><ActivityIcon/><h2>Activity</h2></div><span className={`status-chip ${nodeOnline ? 'online' : 'offline'}`}><i/>{nodeOnline ? 'Node online' : 'Node offline'}</span></div>{activity.length === 0 ? <EmptyState icon={ActivityIcon} title="Quiet for now" body="Submit a command to create durable activity."/> : <><div className="activity-list">{activity.slice(0, 8).map((item) => <ActivityRow key={item.command.commandId} item={item} selected={selected?.command.commandId === item.command.commandId} onClick={() => onSelect(item)}/>)}</div>{selected && <div className="activity-detail"><div className="detail-title"><div><span className={`status-chip ${selected.state}`}><i/>{selected.state}</span>{selected.isFake && <span className="status-chip fake">Fake runner</span>}</div><p>{selected.command.input}</p></div>{selected.state === 'queued' && !nodeOnline && <div className="honest-state"><NodeIcon/><div><strong>Waiting for a node</strong><span>The command is safely queued. Nothing is executing yet.</span></div></div>}{selected.job?.lastError && <div className="event error">{selected.job.lastError}</div>}<div className="event-stream" aria-live="polite">{loadingEvents ? <SkeletonList rows={2}/> : events.length > 0 ? [...events].sort((a, b) => a.sequence - b.sequence).map((event) => <div className={`event ${event.type}`} key={event.eventId}><span>{event.sequence}</span><div><strong>{event.type}</strong><p>{eventData(event.data)}</p></div><time>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(event.createdAt)}</time></div>) : selected.run ? <p className="muted-copy">The run has not emitted visible events yet.</p> : null}</div><div className="detail-actions">{selected.state === 'queued' && <button className="quiet-button danger" onClick={() => onCancel(selected)}>Cancel command</button>}{selected.state === 'failed' && <button className="quiet-button" onClick={() => onRetry(selected)}><RetryIcon/>Retry</button>}<code>{selected.command.commandId.split(':').at(-1)?.slice(0, 8)}</code></div></div>}</>}</div>
}

export function ActivityRow({ item, selected = false, onClick }: { item: ActivityItem; selected?: boolean; onClick: () => void }) {
  return <button className={`activity-row ${selected ? 'selected' : ''}`} onClick={onClick}><span className={`activity-glyph ${item.state}`}><ActivityIcon/></span><div><strong>{item.command.input}</strong><span>{item.state}{item.isFake ? ' · fake runner' : ''} · {formatRelativeTime(item.command.updatedAt)}</span></div><ChevronIcon/></button>
}
