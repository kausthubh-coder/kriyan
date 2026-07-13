'use client'

import {
  formatRelativeTime,
  isNodeAvailable,
  retryEligibility,
  type ActionResult,
  type ActivityItem,
  type ClientRepository,
  type ConnectionMode,
  type NodeItem,
  type PageState,
  type ReminderItem,
  type RunEventItem,
  type TaskItem,
} from '@kriyan/client-core'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { useConvexClientControls } from '@/lib/convex'
import { useRuntimeSettings, type KriyanWebConfiguration } from '@/lib/runtime-settings'
import { useDemoRepository } from '@/src/client-core/demo-repository'
import { useLiveWebRepository } from '@/src/client-core/live-web-repository'
import { useVisibilityClock } from '@/src/client-core/use-visibility-clock'
import type { WebRepository } from '@/src/client-core/web-repository'

import {
  CalendarWorkspace,
  EntitiesWorkspace,
  NotesWorkspace,
  ProductReminderWorkspace,
  ProductTaskWorkspace,
  SourcesWorkspace,
  type ResultHandler,
} from '@/components/productivity/workspaces'
import { RuntimeSettingsWorkspace } from '@/components/productivity/runtime-settings'

import {
  ActivityIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  EditIcon,
  EntityIcon,
  NodeIcon,
  NoteIcon,
  PlusIcon,
  RetryIcon,
  SendIcon,
  SettingsIcon,
  SourceIcon,
  TaskIcon,
  TodayIcon,
} from './icons'

export type Section = 'today' | 'tasks' | 'reminders' | 'calendar' | 'notes' | 'sources' | 'entities' | 'settings'
type NoticeValue = { tone: 'error' | 'success'; text: string }

const NAV_ITEMS: Array<{ key: Section; label: string; href: string; icon: typeof TodayIcon }> = [
  { key: 'today', label: 'Today', href: '/', icon: TodayIcon },
  { key: 'tasks', label: 'Tasks', href: '/tasks', icon: TaskIcon },
  { key: 'reminders', label: 'Reminders', href: '/reminders', icon: BellIcon },
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: CalendarIcon },
  { key: 'notes', label: 'Notes', href: '/notes', icon: NoteIcon },
  { key: 'sources', label: 'Sources', href: '/sources', icon: SourceIcon },
  { key: 'entities', label: 'Entities', href: '/entities', icon: EntityIcon },
  { key: 'settings', label: 'Settings', href: '/settings', icon: SettingsIcon },
]

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

function noticeFrom(result: ActionResult<unknown>, success?: string): NoticeValue | null {
  if (!result.ok) return { tone: 'error', text: result.message }
  return success ? { tone: 'success', text: success } : null
}

function handleResult(setNotice: (notice: NoticeValue | null) => void): ResultHandler {
  return (result, success) => setNotice(noticeFrom(result, success))
}

export function TodayApp({ initialSection }: { initialSection: Section }) {
  const { settings } = useRuntimeSettings()
  return settings.demoMode
    ? <DemoTodayApp initialSection={initialSection} displayName={settings.displayName} />
    : <LiveTodayApp initialSection={initialSection} configuration={settings} displayName={settings.displayName} />
}

function LiveTodayApp({ initialSection, configuration, displayName }: { initialSection: Section; configuration: KriyanWebConfiguration; displayName: string }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const convexClient = useConvexClientControls()
  const runtime = useLiveWebRepository(configuration, selectedRunId, convexClient.generation)
  const snapshot = useSyncExternalStore(
    runtime.reactiveRepository.subscribe,
    runtime.reactiveRepository.getSnapshot,
    runtime.reactiveRepository.getSnapshot,
  )
  const repository = useMemo(() => ({
    ...runtime.repository,
    tasks: snapshot.productivity.tasks,
    reminders: snapshot.productivity.reminders,
    calendarEvents: snapshot.productivity.calendarEvents,
    notes: snapshot.productivity.notes,
    sourceRefs: snapshot.knowledge.sources,
    knowledgeDocuments: snapshot.knowledge.documents,
    nodes: snapshot.nodes.items,
    activity: snapshot.nodes.activity,
  }), [runtime.repository, snapshot])
  return <RepositoryTodayApp initialSection={initialSection} repository={repository} connectionMode={snapshot.connection} connectionRecoveryRequired={runtime.connectionRecoveryRequired} onRecreate={convexClient.recreate} installationId={configuration.installationId} displayName={displayName} demoMode={false} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} />
}

function DemoTodayApp({ initialSection, displayName }: { initialSection: Section; displayName: string }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>('run:demo-retrieval')
  const repository = useDemoRepository(selectedRunId)
  return <RepositoryTodayApp initialSection={initialSection} repository={repository} connectionMode="offline" connectionRecoveryRequired={false} onRecreate={() => undefined} installationId="installation:offline-demo" displayName={displayName} demoMode selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} />
}

function RepositoryTodayApp({ initialSection, repository, connectionMode, connectionRecoveryRequired, onRecreate, installationId, displayName, demoMode, selectedRunId, setSelectedRunId }: {
  initialSection: Section
  repository: WebRepository
  connectionMode: ConnectionMode
  connectionRecoveryRequired: boolean
  onRecreate: () => void
  installationId: string
  displayName: string
  demoMode: boolean
  selectedRunId: string | null
  setSelectedRunId: (runId: string | null) => void
}) {
  const [notice, setNotice] = useState<NoticeValue | null>(null)
  const [renderNow] = useState(() => Date.now())
  const [composer, setComposer] = useState('')
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const heartbeatTimestamps = useMemo(
    () => repository.nodes.map((node) => node.lastHeartbeatAt),
    [repository.nodes],
  )
  const now = useVisibilityClock(heartbeatTimestamps)
  const effectiveNow = now ?? renderNow

  const activity = repository.activity
  const selectedActivity = activity.find((item) => item.command.commandId === selectedCommandId) ?? activity[0]
  const liveNodes = demoMode || now === null ? [] : repository.nodes.filter((node) => isNodeAvailable(node, now))

  useEffect(() => {
    const nextRunId = selectedActivity?.run?.runId ?? null
    if (nextRunId === selectedRunId) return
    const update = setTimeout(() => setSelectedRunId(nextRunId), 0)
    return () => clearTimeout(update)
  }, [selectedActivity?.run?.runId, selectedRunId, setSelectedRunId])

  function selectActivity(item: ActivityItem): void {
    setSelectedCommandId(item.command.commandId)
    setSelectedRunId(item.run?.runId ?? null)
  }

  async function submitCommand(): Promise<void> {
    const input = composer.trim()
    if (!input) return
    setNotice(null)
    const result = await repository.submitCommand(input)
    if (result.ok) {
      setComposer('')
      setSelectedCommandId(result.value.commandId)
      setNotice({
        tone: 'success',
        text: liveNodes.length > 0
          ? 'Command queued. Live activity will update as the node handles it.'
          : 'Command queued. It will remain queued until a node is online.',
      })
    } else setNotice(noticeFrom(result))
  }

  if (repository.installation === null) {
    return <EnrollmentRequired installationId={installationId} />
  }

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <Brand connectionMode={connectionMode} displayName={displayName} demoMode={demoMode} />
        <nav className="primary-nav">
          {NAV_ITEMS.map((item) => <NavItem key={item.key} item={item} active={item.key === initialSection} />)}
        </nav>
        <NodeSummary nodes={repository.nodes} liveNodes={liveNodes} now={now} demoMode={demoMode} />
      </aside>

      <header className="mobile-header">
        <Brand connectionMode={connectionMode} displayName={displayName} demoMode={demoMode} compact />
        <NodeSummary nodes={repository.nodes} liveNodes={liveNodes} now={now} demoMode={demoMode} compact />
      </header>

      <main className="main-content" id="main-content">
        <PageHeader section={initialSection} now={now} />
        {demoMode && <DemoBanner />}
        {!demoMode && connectionMode !== 'online' && (
          <ConnectionBanner
            mode={connectionMode}
            recoveryRequired={connectionRecoveryRequired}
            onRecreate={onRecreate}
          />
        )}
        {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}

        {initialSection === 'today' && (
          <>
            <CommandComposer
              value={composer}
              onChange={setComposer}
              onSubmit={submitCommand}
              busy={repository.pending.has('command:create')}
              nodeOnline={liveNodes.length > 0}
            />
            <TodayOverview
              loading={repository.loading}
              tasks={repository.tasks}
              reminders={repository.reminders}
              now={now}
              pending={repository.pending}
              onToggleTask={async (task) => {
                const result = await repository.setTaskStatus(task, task.status === 'completed' ? 'open' : 'completed')
                setNotice(noticeFrom(result))
              }}
            />
          </>
        )}

        {initialSection === 'tasks' && (
          <ProductTaskWorkspace
            repository={repository}
            now={effectiveNow}
            onResult={handleResult(setNotice)}
          />
        )}

        {initialSection === 'reminders' && (
          <ProductReminderWorkspace
            repository={repository}
            now={effectiveNow}
            onResult={handleResult(setNotice)}
          />
        )}

        {initialSection === 'calendar' && <CalendarWorkspace repository={repository} now={effectiveNow} onResult={handleResult(setNotice)} />}
        {initialSection === 'notes' && <NotesWorkspace repository={repository} onResult={handleResult(setNotice)} />}
        {initialSection === 'sources' && <SourcesWorkspace repository={repository} now={effectiveNow} />}
        {initialSection === 'entities' && <EntitiesWorkspace repository={repository} onResult={handleResult(setNotice)} />}
        {initialSection === 'settings' && <RuntimeSettingsWorkspace />}
      </main>

      <aside className="activity-rail" aria-label="Run activity">
        <ActivityPanel
          activity={activity}
          selected={selectedActivity}
          events={repository.runEvents}
          loadingEvents={repository.loadingRunEvents}
          nodeOnline={liveNodes.length > 0}
          now={now}
          page={repository.pages.activity}
          eventsPage={repository.pages.runEvents}
          pending={repository.pending}
          onLoadMore={() => repository.loadMore('activity')}
          onLoadMoreEvents={() => repository.loadMore('runEvents')}
          onSelect={selectActivity}
          onCancel={async (item) => setNotice(noticeFrom(await repository.cancelCommand(item.command)))}
          onRetry={async (item) => {
            if (!item.job) return
            setNotice(noticeFrom(await repository.retryCommand(item.command, item.job), 'Command queued for another attempt.'))
          }}
        />
      </aside>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => <NavItem key={item.key} item={item} active={item.key === initialSection} />)}
      </nav>
    </div>
  )
}

function EnrollmentRequired({ installationId }: { installationId: string }) {
  return (
    <main className="fatal-state" aria-labelledby="enrollment-title">
      <div className="brand-mark">K</div>
      <h1 id="enrollment-title">Finish local enrollment</h1>
      <p>
        The configured installation <code>{installationId}</code> does not exist in this Convex deployment.
        Create or pair it through the local Kriyan setup flow, then reload this page.
      </p>
      <p>Kriyan will not create or select a shared installation from a public browser session.</p>
    </main>
  )
}

export function Brand({ connectionMode, displayName = 'Personal agent', demoMode = false, compact = false }: { connectionMode: ConnectionMode; displayName?: string; demoMode?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand-compact' : 'brand'}>
      <div className="brand-mark">K</div>
      <div><strong>Kriyan</strong>{!compact && <span>{displayName}</span>}</div>
      <span className={`connection-label ${demoMode ? 'demo' : connectionMode}`} role="status" aria-live="polite">
        <i />{demoMode ? 'demo' : connectionMode}
      </span>
    </div>
  )
}

function NavItem({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon
  return <Link href={item.href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><Icon /><span>{item.label}</span></Link>
}

export function NodeSummary({ nodes, liveNodes, now, demoMode = false, compact = false }: { nodes: NodeItem[]; liveNodes: NodeItem[]; now: number | null; demoMode?: boolean; compact?: boolean }) {
  const live = liveNodes[0]
  const label = demoMode ? 'Sample VPS node' : live ? live.displayName : nodes.length > 0 ? 'Node offline' : 'No node paired'
  const detail = demoMode ? 'Static offline verification data' : live && now !== null ? `Heartbeat ${formatRelativeTime(live.lastHeartbeatAt, now)}` : 'Commands will wait safely'
  return (
    <div className={compact ? 'node-summary compact' : 'node-summary'} role="status" aria-live="polite">
      <NodeIcon />
      <div><strong>{label}</strong>{!compact && <span>{detail}</span>}</div>
      <span className={`node-state-label ${live ? 'online' : 'offline'}`}><i />{demoMode ? 'Demo' : live ? 'Online' : 'Offline'}</span>
    </div>
  )
}

export function PageHeader({ section, now }: { section: Section; now: number | null }) {
  const copy = {
    today: ['Today', 'See what needs you, what is scheduled, and what Kriyan is doing.'],
    tasks: ['Tasks', 'Keep the next actions small, current, and visible.'],
    reminders: ['Reminders', 'Time-bound intentions, synchronized through your installation.'],
    calendar: ['Calendar', 'Browse the day or week, then edit time where work actually happens.'],
    notes: ['Notes', 'Durable writing stored as validated TipTap JSON with a searchable preview.'],
    sources: ['Knowledge sources', 'See what your node has synchronized and indexed without exposing the private vault.'],
    entities: ['Entities', 'Compact project, person, and topic projections with traceable provenance.'],
    settings: ['Settings', 'Choose this client’s self-hosted Convex installation or a fully offline demo.'],
  }[section]
  const dateLabel = now === null
    ? 'Your current day'
    : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now)
  return <header className="page-header"><p>{dateLabel}</p><h1>{copy[0]}</h1><span>{copy[1]}</span></header>
}

function DemoBanner() {
  return <div className="connection-banner demo" role="status"><span className="status-dot" /><span>Offline demo mode. All visible work is local sample data; no Convex deployment or VPS node is connected.</span><Link className="quiet-button" href="/settings">Connection settings</Link></div>
}

function ConnectionBanner({ mode, recoveryRequired, onRecreate }: { mode: ConnectionMode; recoveryRequired: boolean; onRecreate: () => void }) {
  const copy = mode === 'offline'
    ? 'You are offline. Live changes are paused; unsent changes will show an error instead of pretending to save.'
    : recoveryRequired
      ? 'Kriyan opened a new connection but could not confirm its subscriptions. Recreate this tab’s live connection to retry safely.'
      : mode === 'reconnecting'
      ? 'Reconnecting to Kriyan. Existing data stays visible until Convex confirms the new transport.'
      : 'Connecting to your Kriyan installation…'
  return <div className={`connection-banner ${mode}`} role="status" aria-live="polite"><span className="status-dot" /><span>{copy}</span>{recoveryRequired && <button className="quiet-button" onClick={onRecreate}>Recreate connection</button>}</div>
}

function Notice({ notice, onClose }: { notice: NoticeValue; onClose: () => void }) {
  return <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button className="icon-button" onClick={onClose} aria-label="Dismiss message"><CloseIcon /></button></div>
}

export interface ComposerKeyEvent {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  nativeEvent: { isComposing?: boolean; keyCode?: number }
  preventDefault: () => void
  currentTarget?: {
    value: string
    selectionStart: number | null
    selectionEnd: number | null
    setSelectionRange: (selectionStart: number, selectionEnd: number) => void
  }
}

export function handleComposerKeyDown(
  event: ComposerKeyEvent,
  onSubmit: () => Promise<void>,
  onChange: (value: string) => void,
): void {
  const isComposing = event.nativeEvent.isComposing === true
    || event.nativeEvent.keyCode === 229
  const isPlainTab = event.key === 'Tab'
    && !event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !isComposing
  if (isPlainTab && event.currentTarget) {
    event.preventDefault()
    const target = event.currentTarget
    const selectionStart = target.selectionStart ?? target.value.length
    const selectionEnd = target.selectionEnd ?? selectionStart
    const nextValue = `${target.value.slice(0, selectionStart)}\t${target.value.slice(selectionEnd)}`
    const nextCaret = selectionStart + 1
    onChange(nextValue)
    queueMicrotask(() => target.setSelectionRange(nextCaret, nextCaret))
    return
  }
  const isPlainEnter = event.key === 'Enter'
    && !event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !isComposing
  if (!isPlainEnter) return
  event.preventDefault()
  void onSubmit()
}

function CommandComposer({ value, onChange, onSubmit, busy, nodeOnline }: { value: string; onChange: (value: string) => void; onSubmit: () => Promise<void>; busy: boolean; nodeOnline: boolean }) {
  return (
    <section className="composer" aria-labelledby="composer-title">
      <div><h2 id="composer-title">What should Kriyan handle?</h2><span>{nodeOnline ? 'Your node is ready.' : 'No node is online. New commands will wait in the queue.'}</span></div>
      <div className="composer-control">
        <textarea value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => handleComposerKeyDown(event, onSubmit, onChange)} rows={2} maxLength={8192} placeholder="remind me tomorrow at 8 to practice Korean" aria-describedby="composer-help" disabled={busy} />
        <button className="primary-button send-button" onClick={() => void onSubmit()} disabled={!value.trim() || busy} aria-label={busy ? 'Queueing command' : 'Queue command'}>{busy ? <span className="spinner" /> : <SendIcon />}</button>
      </div>
      <p id="composer-help">Enter to queue · Shift + Enter for a new line · Tab to indent</p>
    </section>
  )
}

function TodayOverview({ loading, tasks, reminders, now, pending, onToggleTask }: { loading: boolean; tasks: TaskItem[]; reminders: ReminderItem[]; now: number | null; pending: ReadonlySet<string>; onToggleTask: (task: TaskItem) => Promise<void> }) {
  const allOpenTasks = tasks.filter((task) => task.status === 'open')
  const allScheduled = reminders.filter((reminder) => reminder.status === 'scheduled')
  const openTasks = allOpenTasks.slice(0, 5)
  const scheduled = allScheduled.slice(0, 4)
  return (
    <div className="today-grid">
      <section className="content-section"><SectionHeading title="Next actions" href="/tasks" count={`${openTasks.length} shown · ${allOpenTasks.length} loaded`} />{loading ? <SkeletonList /> : openTasks.length === 0 ? <EmptyState icon={CheckIcon} title="Nothing is pressing" body="Add a task when you know the next concrete action." href="/tasks" action="Add a task" /> : <div className="ruled-list">{openTasks.map((task) => <TaskRow key={task.taskId} task={task} now={now} compact pending={pending.has(`task:${task.taskId}`)} onToggle={onToggleTask} />)}</div>}</section>
      <section className="content-section"><SectionHeading title="Coming up" href="/reminders" count={`${scheduled.length} shown · ${allScheduled.length} loaded`} />{loading ? <SkeletonList rows={2} /> : scheduled.length === 0 ? <EmptyState icon={BellIcon} title="No reminders scheduled" body="Ask Kriyan or schedule one directly." href="/reminders" action="Schedule reminder" /> : <div className="ruled-list">{scheduled.map((reminder) => <ReminderRow key={reminder.reminderId} reminder={reminder} now={now} compact />)}</div>}</section>
    </div>
  )
}

export function SectionHeading({ title, count, href }: { title: string; count: number | string; href?: string }) {
  return <div className="section-heading"><h2>{title}</h2><div><span>{count}</span>{href && <Link href={href}>View all <ChevronIcon /></Link>}</div></div>
}

function SkeletonList({ rows = 3 }: { rows?: number }) { return <div className="skeleton-list" aria-label="Loading">{Array.from({ length: rows }, (_, index) => <div key={index}><i/><span/></div>)}</div> }

function EmptyState({ icon: Icon, title, body, href, action }: { icon: typeof CheckIcon; title: string; body: string; href?: string; action?: string }) {
  return <div className="empty-state"><Icon /><div><strong>{title}</strong><span>{body}</span></div>{href && action && <Link className="quiet-button" href={href}>{action}</Link>}</div>
}

function LoadMore({ page, onLoadMore, label }: { page: PageState; onLoadMore: () => void; label: string }) {
  return (
    <div className="continuation">
      <span>{page.loadedCount} loaded{page.canLoadMore ? ' · more available' : ''}</span>
      {page.canLoadMore && <button className="quiet-button" onClick={onLoadMore} disabled={page.loadingMore}>{page.loadingMore ? 'Loading…' : label}</button>}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TaskWorkspace({ repository, now, onNotice }: { repository: ClientRepository; now: number | null; onNotice: (notice: NoticeValue | null) => void }) {
  const [showCompleted, setShowCompleted] = useState(false)
  const visible = repository.tasks.filter((task) => task.status === (showCompleted ? 'completed' : 'open'))
  const page = showCompleted ? repository.pages.completedTasks : repository.pages.openTasks
  return (
    <section className="workspace">
      <CreateTaskForm busy={repository.pending.has('task:create')} onCreate={async (title, dueAt) => {
        const result = await repository.createTask({ title, dueAt })
        onNotice(noticeFrom(result))
        return result.ok
      }}/>
      <div className="workspace-toolbar"><div className="segmented-control" aria-label="Task status filter"><button className={!showCompleted ? 'active' : ''} aria-pressed={!showCompleted} onClick={() => setShowCompleted(false)}>Open</button><button className={showCompleted ? 'active' : ''} aria-pressed={showCompleted} onClick={() => setShowCompleted(true)}>Completed</button></div><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}</span></div>
      {repository.loading ? <SkeletonList rows={5}/> : visible.length === 0 ? <EmptyState icon={TaskIcon} title={showCompleted ? 'No completed tasks yet' : 'Your task list is clear'} body={showCompleted ? 'Completed work will stay available here.' : 'Capture the smallest useful next action above.'}/> : <div className="ruled-list workspace-list">{visible.map((task) => <TaskRow key={task.taskId} task={task} now={now} pending={repository.pending.has(`task:${task.taskId}`)} onToggle={async (item) => onNotice(noticeFrom(await repository.setTaskStatus(item, item.status === 'completed' ? 'open' : 'completed')))} onUpdate={async (item, title, dueAt) => { const result = await repository.updateTask(item, { title, dueAt }); onNotice(noticeFrom(result)); return result }} onCancel={async (item) => onNotice(noticeFrom(await repository.cancelTask(item)))}/>)}</div>}
      <LoadMore page={page} onLoadMore={() => repository.loadMore(showCompleted ? 'completedTasks' : 'openTasks')} label="Load more tasks" />
    </section>
  )
}

function CreateTaskForm({ busy, onCreate }: { busy: boolean; onCreate: (title: string, dueAt?: number) => Promise<boolean> }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  return <form className="inline-create" onSubmit={async (event) => { event.preventDefault(); if (!title.trim() || busy) return; const ok = await onCreate(title.trim(), due ? new Date(`${due}T17:00`).getTime() : undefined); if (ok) { setTitle(''); setDue('') } }}><label><span>New task</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write the next concrete action" maxLength={1024} disabled={busy}/></label><label className="date-field"><span>Due</span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} disabled={busy}/></label><button className="primary-button" disabled={!title.trim() || busy}>{busy ? 'Adding…' : <><PlusIcon/>Add task</>}</button></form>
}

export function TaskRow({ task, now = null, compact = false, pending = false, onToggle = async () => {}, onUpdate, onCancel }: { task: TaskItem; now?: number | null; compact?: boolean; pending?: boolean; onToggle?: (task: TaskItem) => Promise<void>; onUpdate?: (task: TaskItem, title: string, dueAt?: number) => Promise<ActionResult>; onCancel?: (task: TaskItem) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : '')
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = (): void => { requestAnimationFrame(() => editButton.current?.focus()) }
  if (editing && onUpdate) return <form className="edit-row" onSubmit={async (event) => { event.preventDefault(); if (!title.trim() || pending) return; const result = await onUpdate(task, title.trim(), due ? new Date(`${due}T17:00`).getTime() : undefined); if (result.ok) { setEditing(false); restoreFocus() } }}><input aria-label="Task title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus disabled={pending}/><input aria-label="Due date" type="date" value={due} onChange={(event) => setDue(event.target.value)} disabled={pending}/><button className="quiet-button" type="submit" disabled={pending}>Save</button><button className="icon-button" type="button" aria-label="Cancel editing" onClick={() => { setEditing(false); restoreFocus() }} disabled={pending}><CloseIcon/></button></form>
  const relative = now === null ? 'Time available after connection' : task.dueAt ? formatRelativeTime(task.dueAt, now) : 'No due date'
  return <div className={`task-row ${task.status === 'completed' ? 'completed' : ''} ${task.optimistic ? 'optimistic' : ''}`} aria-busy={pending || task.optimistic}><button className="task-check" onClick={() => void onToggle(task)} aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={pending || task.optimistic}>{task.status === 'completed' && <CheckIcon/>}</button><div><strong>{task.title}</strong><span>{task.optimistic || pending ? 'Saving…' : relative}</span></div>{!compact && <div className="row-actions"><button ref={editButton} className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => setEditing(true)} disabled={pending || task.optimistic}><EditIcon/></button><button className="icon-button danger" aria-label={`Cancel ${task.title}`} onClick={() => void onCancel?.(task)} disabled={pending || task.optimistic}><CloseIcon/></button></div>}</div>
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReminderWorkspace({ repository, now, onNotice }: { repository: ClientRepository; now: number | null; onNotice: (notice: NoticeValue | null) => void }) {
  const visible = repository.reminders.filter((reminder) => reminder.status !== 'cancelled')
  return <section className="workspace"><CreateReminderForm busy={repository.pending.has('reminder:create')} onCreate={async (message, remindAt) => { const result = await repository.createReminder({ message, remindAt, timezone: repository.installation?.timezone ?? 'UTC' }); onNotice(noticeFrom(result)); return result.ok }}/><div className="workspace-toolbar"><strong>Scheduled and recent</strong><span>{visible.length} {visible.length === 1 ? 'reminder' : 'reminders'}</span></div>{repository.loading ? <SkeletonList rows={4}/> : visible.length === 0 ? <EmptyState icon={BellIcon} title="Nothing scheduled" body="Add a specific time so Kriyan can keep the intention durable."/> : <div className="ruled-list workspace-list">{visible.map((reminder) => <ReminderRow key={reminder.reminderId} reminder={reminder} now={now} pending={repository.pending.has(`reminder:${reminder.reminderId}`)} onUpdate={async (item, message, remindAt) => { const result = await repository.updateReminder(item, { message, remindAt }); onNotice(noticeFrom(result)); return result }} onDismiss={async (item) => onNotice(noticeFrom(await repository.setReminderStatus(item, 'dismissed')))} onCancel={async (item) => onNotice(noticeFrom(await repository.cancelReminder(item)))}/>)}</div>}<LoadMore page={repository.pages.reminders} onLoadMore={() => repository.loadMore('reminders')} label="Load more reminders" /></section>
}

function nextHourLocal(): string { const date = new Date(Date.now() + 3_600_000); date.setMinutes(0, 0, 0); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16) }

function CreateReminderForm({ busy, onCreate }: { busy: boolean; onCreate: (message: string, remindAt: number) => Promise<boolean> }) {
  const [message, setMessage] = useState('')
  const [when, setWhen] = useState('')
  return <form className="inline-create reminder-create" onSubmit={async (event) => { event.preventDefault(); const remindAt = new Date(when).getTime(); if (!message.trim() || !Number.isFinite(remindAt) || busy) return; const ok = await onCreate(message.trim(), remindAt); if (ok) { setMessage(''); setWhen('') } }}><label><span>New reminder</span><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Practice Korean" maxLength={4096} disabled={busy}/></label><label className="datetime-field"><span>When</span><input type="datetime-local" value={when} onFocus={() => { if (!when) setWhen(nextHourLocal()) }} onChange={(event) => setWhen(event.target.value)} disabled={busy}/></label><button className="primary-button" disabled={!message.trim() || !when || busy}>{busy ? 'Scheduling…' : <><PlusIcon/>Schedule</>}</button></form>
}

export function ReminderRow({ reminder, now = null, compact = false, pending = false, onUpdate, onDismiss, onCancel }: { reminder: ReminderItem; now?: number | null; compact?: boolean; pending?: boolean; onUpdate?: (reminder: ReminderItem, message: string, remindAt: number) => Promise<ActionResult>; onDismiss?: (reminder: ReminderItem) => Promise<void>; onCancel?: (reminder: ReminderItem) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(reminder.message)
  const offset = new Date(reminder.remindAt).getTimezoneOffset() * 60_000
  const [when, setWhen] = useState(new Date(reminder.remindAt - offset).toISOString().slice(0, 16))
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = (): void => { requestAnimationFrame(() => editButton.current?.focus()) }
  if (editing && onUpdate) return <form className="edit-row" onSubmit={async (event) => { event.preventDefault(); const remindAt = new Date(when).getTime(); if (!message.trim() || !Number.isFinite(remindAt) || pending) return; const result = await onUpdate(reminder, message.trim(), remindAt); if (result.ok) { setEditing(false); restoreFocus() } }}><input aria-label="Reminder message" value={message} onChange={(event) => setMessage(event.target.value)} autoFocus disabled={pending}/><input aria-label="Reminder time" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} disabled={pending}/><button className="quiet-button" type="submit" disabled={pending}>Save</button><button className="icon-button" type="button" aria-label="Cancel editing" onClick={() => { setEditing(false); restoreFocus() }} disabled={pending}><CloseIcon/></button></form>
  const absolute = now === null ? ['Time', 'Pending'] : [new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(reminder.remindAt), new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(reminder.remindAt)]
  const relative = now === null ? 'Time available after connection' : `${formatRelativeTime(reminder.remindAt, now)} · ${reminder.status}`
  return <div className={`reminder-row ${reminder.optimistic ? 'optimistic' : ''}`} aria-busy={pending || reminder.optimistic}><div className="reminder-time"><strong>{absolute[0]}</strong><span>{absolute[1]}</span></div><div><strong>{reminder.message}</strong><span>{reminder.optimistic || pending ? 'Saving…' : relative}</span></div>{!compact && <div className="row-actions"><button className="quiet-button" onClick={() => void onDismiss?.(reminder)} disabled={pending || reminder.optimistic || reminder.status === 'dismissed'}>Dismiss</button><button ref={editButton} className="icon-button" aria-label={`Edit ${reminder.message}`} onClick={() => setEditing(true)} disabled={pending || reminder.optimistic}><EditIcon/></button><button className="icon-button danger" aria-label={`Cancel ${reminder.message}`} onClick={() => void onCancel?.(reminder)} disabled={pending || reminder.optimistic}><CloseIcon/></button></div>}</div>
}

function ActivityPanel({ activity, selected, events, loadingEvents, nodeOnline, now, page, eventsPage, pending, onLoadMore, onLoadMoreEvents, onSelect, onCancel, onRetry }: { activity: ActivityItem[]; selected?: ActivityItem; events: RunEventItem[]; loadingEvents: boolean; nodeOnline: boolean; now: number | null; page: PageState; eventsPage: PageState; pending: ReadonlySet<string>; onLoadMore: () => void; onLoadMoreEvents: () => void; onSelect: (item: ActivityItem) => void; onCancel: (item: ActivityItem) => Promise<void>; onRetry: (item: ActivityItem) => Promise<void> }) {
  const retry = selected ? retryEligibility(selected) : null
  const commandPending = selected ? pending.has(`command:${selected.command.commandId}`) : false
  return <div className="activity-panel"><div className="activity-header"><div><ActivityIcon/><h2>Activity</h2></div><span className={`status-chip ${nodeOnline ? 'online' : 'offline'}`}><i/>{nodeOnline ? 'Node online' : 'Node offline'}</span></div>{activity.length === 0 ? <EmptyState icon={ActivityIcon} title="Quiet for now" body="Submit a command to create durable activity."/> : <><div className="activity-list" aria-label="Command activity">{activity.map((item) => <ActivityRow key={item.command.commandId} item={item} now={now} selected={selected?.command.commandId === item.command.commandId} onClick={() => onSelect(item)}/>)}</div><LoadMore page={page} onLoadMore={onLoadMore} label="Load older activity" />{selected && <div className="activity-detail"><div className="detail-title"><div><span className={`status-chip ${selected.state}`}><i/>{selected.state}</span>{selected.isFake && <span className="status-chip fake">Fake runner</span>}</div><p>{selected.command.input}</p></div>{selected.state === 'queued' && !nodeOnline && <div className="honest-state"><NodeIcon/><div><strong>Waiting for a node</strong><span>The command is safely queued. Nothing is executing yet.</span></div></div>}{selected.job?.lastError && <div className="event error">{selected.job.lastError}</div>}<div className="event-stream" aria-live="polite">{loadingEvents ? <SkeletonList rows={2}/> : events.length > 0 ? events.map((event) => <div className={`event ${event.type}`} key={event.eventId}><span>{event.sequence}</span><div><strong>{event.type}</strong><p>{eventData(event.data)}</p></div><time>{now === null ? 'Time pending' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(event.createdAt)}</time></div>) : selected.run ? <p className="muted-copy">The run has not emitted visible events yet.</p> : null}</div>{events.length > 0 && <LoadMore page={eventsPage} onLoadMore={onLoadMoreEvents} label="Load earlier events" />}<div className="detail-actions">{selected.state === 'queued' && <button className="quiet-button danger" onClick={() => void onCancel(selected)} disabled={commandPending}>Cancel command</button>}{selected.state === 'failed' && <button className="quiet-button" onClick={() => void onRetry(selected)} disabled={!retry?.eligible || commandPending} title={retry?.reason}><RetryIcon/>{commandPending ? 'Retrying…' : retry?.eligible ? 'Retry' : 'Retry unavailable'}</button>}<code>{selected.command.commandId.split(':').at(-1)?.slice(0, 8)}</code></div>{selected.state === 'failed' && retry && <p className="action-reason">{retry.reason}</p>}</div>}</>}</div>
}

export function ActivityRow({ item, now = null, selected = false, onClick }: { item: ActivityItem; now?: number | null; selected?: boolean; onClick: () => void }) {
  const relative = now === null ? 'Time available after connection' : formatRelativeTime(item.command.updatedAt, now)
  return <button className={`activity-row ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}><span className={`activity-glyph ${item.state}`}><ActivityIcon/></span><div><strong>{item.command.input}</strong><span>{item.state}{item.isFake ? ' · fake runner' : ''} · {relative}</span></div><ChevronIcon/></button>
}
