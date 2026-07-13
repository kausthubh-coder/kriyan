'use client'

import {
  deriveCalendarAgenda,
  deriveTaskSections,
  formatRelativeTime,
  type ActionResult,
  type AppNoteItem,
  type CalendarEventItem,
  type ReminderItem,
  type TaskItem,
  type TaskPriority,
} from '@kriyan/client-core'
import { useMemo, useState } from 'react'

import type { CalendarDraft, ReminderDraft, TaskDraft, WebRepository } from '@/src/client-core/web-repository'

import { NoteEditor } from './note-editor'

export type ResultHandler = (result: ActionResult<unknown>, success?: string) => void

function localInput(value?: number): string {
  if (value === undefined) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function timeValue(value: string): number | undefined {
  if (!value) return undefined
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

function tags(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill ${value}`}><i />{value.replace('-', ' ')}</span>
}

function LoadMore({ repository, page, label }: { repository: WebRepository; page: keyof WebRepository['pages']; label: string }) {
  const state = repository.pages[page]
  return <div className="continuation"><span>{state.loadedCount} loaded{state.canLoadMore ? ' · more available' : ''}</span>{state.canLoadMore && <button className="quiet-button" onClick={() => repository.loadMore(page)} disabled={state.loadingMore}>{state.loadingMore ? 'Loading…' : label}</button>}</div>
}

function TaskForm({ initial, busy, submit, cancel }: { initial?: TaskItem; busy: boolean; submit: (draft: TaskDraft) => Promise<boolean>; cancel?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tagText, setTagText] = useState(initial?.tags?.join(', ') ?? '')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'normal')
  const [startAt, setStartAt] = useState(localInput(initial?.startAt))
  const [dueAt, setDueAt] = useState(localInput(initial?.dueAt))
  const [projectId, setProjectId] = useState(initial?.projectId ?? '')
  const [entityId, setEntityId] = useState(initial?.entityId ?? '')
  return (
    <form className="detail-form" onSubmit={async (event) => {
      event.preventDefault()
      if (!title.trim()) return
      const ok = await submit({ title: title.trim(), description: description.trim() || undefined, tags: tags(tagText), priority, startAt: timeValue(startAt), dueAt: timeValue(dueAt), projectId: projectId.trim() || undefined, entityId: entityId.trim() || undefined })
      if (ok && !initial) { setTitle(''); setDescription(''); setTagText(''); setStartAt(''); setDueAt(''); setProjectId(''); setEntityId('') }
    }}>
      <label className="span-2"><span>Task</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write the next concrete action" required /></label>
      <label className="span-2"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, outcome, or definition of done" rows={2} /></label>
      <label><span>Tags</span><input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="web, kriyan" /></label>
      <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label><span>Start</span><input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
      <label><span>Due</span><input type="datetime-local" value={dueAt} min={startAt} onChange={(event) => setDueAt(event.target.value)} /></label>
      <label><span>Project link</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="project:kriyan" /></label>
      <label><span>Entity link</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="entity:kriyan" /></label>
      <div className="form-actions span-2"><button className="primary-button" disabled={busy || !title.trim()}>{busy ? 'Saving…' : initial ? 'Save task' : 'Add task'}</button>{cancel && <button className="quiet-button" type="button" onClick={cancel}>Cancel</button>}</div>
    </form>
  )
}

function TaskItemView({ task, repository, now, onResult }: { task: TaskItem; repository: WebRepository; now: number; onResult: ResultHandler }) {
  const [editing, setEditing] = useState(false)
  const busy = repository.pending.has(`task:${task.taskId}`)
  if (editing) return <TaskForm initial={task} busy={busy} cancel={() => setEditing(false)} submit={async (draft) => { const result = await repository.updateTask(task, draft); onResult(result, 'Task updated.'); if (result.ok) setEditing(false); return result.ok }} />
  return <article className={`product-row ${task.status}`}>
    <button className="task-check" aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={async () => onResult(await repository.setTaskStatus(task, task.status === 'completed' ? 'open' : 'completed'), task.status === 'completed' ? 'Task reopened.' : 'Task completed.')} disabled={busy}>{task.status === 'completed' ? '✓' : ''}</button>
    <div className="row-copy"><div className="row-title"><strong>{task.title}</strong><StatusPill value={task.priority ?? 'normal'} />{task.optimistic && <span className="sync-copy">Saving…</span>}</div>{task.description && <p>{task.description}</p>}<div className="metadata">{task.dueAt && <span>{task.dueAt < now ? 'Overdue · ' : 'Due '}{formatRelativeTime(task.dueAt, now)}</span>}{task.tags?.map((tag) => <span key={tag}>#{tag}</span>)}{task.projectId && <span>{task.projectId}</span>}{task.entityId && <span>{task.entityId}</span>}<span>rev {task.revision}</span></div></div>
    <div className="row-actions"><button className="quiet-button" onClick={() => setEditing(true)}>Edit</button><button className="quiet-button danger" onClick={async () => onResult(await repository.cancelTask(task), 'Task deleted.')} disabled={busy}>Delete</button></div>
  </article>
}

export function ProductTaskWorkspace({ repository, now, onResult }: { repository: WebRepository; now: number; onResult: ResultHandler }) {
  const [showCompleted, setShowCompleted] = useState(false)
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = start.getTime() + 86_399_999
  const sections = deriveTaskSections(repository.tasks, start.getTime(), end)
  const groups = showCompleted
    ? [{ label: 'Completed', items: repository.tasks.filter((task) => task.status === 'completed') }]
    : [{ label: 'Overdue', items: sections.overdue }, { label: 'Today', items: sections.today }, { label: 'Upcoming', items: sections.upcoming }, { label: 'Unscheduled', items: sections.unscheduled }]
  return <div className="workspace product-workspace">
    <TaskForm busy={repository.pending.has('task:create')} submit={async (draft) => { const result = await repository.createTask(draft); onResult(result, 'Task added.'); return result.ok }} />
    <div className="workspace-toolbar"><div className="segmented-control"><button className={!showCompleted ? 'active' : ''} onClick={() => setShowCompleted(false)}>Open</button><button className={showCompleted ? 'active' : ''} onClick={() => setShowCompleted(true)}>Completed</button></div><span>{repository.tasks.length} loaded</span></div>
    {groups.map((group) => group.items.length > 0 && <section key={group.label} className="content-section"><div className="section-heading"><h2>{group.label}</h2><span>{group.items.length}</span></div><div className="ruled-list">{group.items.map((task) => <TaskItemView key={task.taskId} task={task} repository={repository} now={now} onResult={onResult} />)}</div></section>)}
    <LoadMore repository={repository} page={showCompleted ? 'completedTasks' : 'openTasks'} label="Load more tasks" />
  </div>
}

function ReminderForm({ initial, busy, submit, cancel }: { initial?: ReminderItem; busy: boolean; submit: (draft: ReminderDraft) => Promise<boolean>; cancel?: () => void }) {
  const [message, setMessage] = useState(initial?.message ?? '')
  const [remindAt, setRemindAt] = useState(localInput(initial?.nextFireAt ?? initial?.remindAt))
  const [policy, setPolicy] = useState<'normal' | 'persistent' | 'critical'>(initial?.deliveryPolicy ?? 'normal')
  const [linkedTaskId, setLinkedTaskId] = useState(initial?.linkedTaskId ?? '')
  const [entityId, setEntityId] = useState(initial?.entityId ?? '')
  return <form className="detail-form reminder-form" onSubmit={async (event) => { event.preventDefault(); const when = timeValue(remindAt); if (!message.trim() || when === undefined) return; const ok = await submit({ message: message.trim(), remindAt: when, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, deliveryPolicy: policy, linkedTaskId: linkedTaskId.trim() || undefined, entityId: entityId.trim() || undefined }); if (ok && !initial) { setMessage(''); setRemindAt(''); setPolicy('normal'); setLinkedTaskId(''); setEntityId('') } }}>
    <label className="span-2"><span>Reminder</span><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What needs your attention?" required /></label>
    <label><span>When</span><input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} required /></label>
    <label><span>Attention policy</span><select value={policy} onChange={(event) => setPolicy(event.target.value as 'normal' | 'persistent' | 'critical')}><option value="normal">Normal</option><option value="persistent">Persistent</option><option value="critical">Critical</option></select></label>
    <label><span>Linked task</span><input value={linkedTaskId} onChange={(event) => setLinkedTaskId(event.target.value)} placeholder="task:…" /></label>
    <label><span>Linked entity</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="entity:…" /></label>
    <div className="form-actions span-2"><button className="primary-button" disabled={busy || !message.trim() || !remindAt}>{busy ? 'Saving…' : initial ? 'Save reminder' : 'Schedule reminder'}</button>{cancel && <button className="quiet-button" type="button" onClick={cancel}>Cancel</button>}</div>
  </form>
}

function ReminderItemView({ reminder, repository, now, onResult }: { reminder: ReminderItem; repository: WebRepository; now: number; onResult: ResultHandler }) {
  const [editing, setEditing] = useState(false)
  const busy = repository.pending.has(`reminder:${reminder.reminderId}`)
  if (editing) return <ReminderForm initial={reminder} busy={busy} cancel={() => setEditing(false)} submit={async (draft) => { const result = await repository.updateReminder(reminder, draft); onResult(result, 'Reminder updated.'); if (result.ok) setEditing(false); return result.ok }} />
  return <article className="product-row"><div className="reminder-policy"><StatusPill value={reminder.deliveryPolicy ?? 'normal'} /></div><div className="row-copy"><div className="row-title"><strong>{reminder.message}</strong><StatusPill value={reminder.status} /></div><div className="metadata"><span>{formatRelativeTime(reminder.nextFireAt ?? reminder.remindAt, now)}</span>{reminder.linkedTaskId && <span>{reminder.linkedTaskId}</span>}{reminder.entityId && <span>{reminder.entityId}</span>}<span>rev {reminder.revision}</span></div></div><div className="row-actions"><button className="quiet-button" onClick={async () => onResult(await repository.snoozeReminder(reminder, now + 10 * 60_000), 'Snoozed for 10 minutes.')} disabled={busy || reminder.status === 'acknowledged'}>Snooze</button><button className="quiet-button" onClick={async () => onResult(await repository.acknowledgeReminder(reminder), 'Reminder acknowledged.')} disabled={busy || reminder.status === 'acknowledged'}>Acknowledge</button><button className="quiet-button" onClick={() => setEditing(true)}>Edit</button><button className="quiet-button danger" onClick={async () => onResult(await repository.cancelReminder(reminder), 'Reminder deleted.')} disabled={busy}>Delete</button></div></article>
}

export function ProductReminderWorkspace({ repository, now, onResult }: { repository: WebRepository; now: number; onResult: ResultHandler }) {
  const active = repository.reminders.filter((item) => item.status !== 'cancelled' && item.status !== 'dismissed')
  return <div className="workspace product-workspace"><div className="honesty-note"><strong>Web attention is best effort.</strong><span>Persistent and critical policies are stored and visible, but this browser alone cannot guarantee native urgent delivery. A paired native client is required for that.</span></div><ReminderForm busy={repository.pending.has('reminder:create')} submit={async (draft) => { const result = await repository.createReminder(draft); onResult(result, 'Reminder scheduled.'); return result.ok }} /><section className="content-section"><div className="section-heading"><h2>Lifecycle</h2><span>{active.length} active</span></div><div className="ruled-list">{active.map((reminder) => <ReminderItemView key={reminder.reminderId} reminder={reminder} repository={repository} now={now} onResult={onResult} />)}</div></section><LoadMore repository={repository} page="reminders" label="Load more reminders" /></div>
}

function CalendarForm({ initial, busy, submit, cancel }: { initial?: CalendarEventItem; busy: boolean; submit: (draft: CalendarDraft) => Promise<boolean>; cancel?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [startAt, setStartAt] = useState(localInput(initial?.startAt))
  const [endAt, setEndAt] = useState(localInput(initial?.endAt))
  const [location, setLocation] = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  return <form className="detail-form" onSubmit={async (event) => { event.preventDefault(); const start = timeValue(startAt); const end = timeValue(endAt); if (!title.trim() || start === undefined || end === undefined || end <= start) return; const ok = await submit({ title: title.trim(), description: description.trim() || undefined, startAt: start, endAt: end, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, allDay: false, location: location.trim() || undefined }); if (ok && !initial) { setTitle(''); setStartAt(''); setEndAt(''); setLocation(''); setDescription('') } }}><label className="span-2"><span>Event</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label><span>Starts</span><input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></label><label><span>Ends</span><input type="datetime-local" value={endAt} min={startAt} onChange={(event) => setEndAt(event.target.value)} required /></label><label><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label><label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="form-actions span-2"><button className="primary-button" disabled={busy}>{initial ? 'Save event' : 'Add event'}</button>{cancel && <button className="quiet-button" type="button" onClick={cancel}>Cancel</button>}</div></form>
}

export function CalendarWorkspace({ repository, now, onResult }: { repository: WebRepository; now: number; onResult: ResultHandler }) {
  const [cursor, setCursor] = useState(() => { const date = new Date(now); date.setHours(0, 0, 0, 0); return date.getTime() })
  const [view, setView] = useState<'day' | 'week'>('week')
  const rangeEnd = cursor + (view === 'day' ? 1 : 7) * 86_400_000 - 1
  const events = deriveCalendarAgenda(repository.calendarEvents, cursor, rangeEnd)
  return <div className="workspace product-workspace"><CalendarForm busy={repository.pending.has('calendar:create')} submit={async (draft) => { const result = await repository.createCalendarEvent(draft); onResult(result, 'Event added.'); return result.ok }} /><div className="calendar-toolbar"><div><button className="quiet-button" onClick={() => setCursor((value) => value - (view === 'day' ? 1 : 7) * 86_400_000)}>Previous</button><button className="quiet-button" onClick={() => { const date = new Date(); date.setHours(0, 0, 0, 0); setCursor(date.getTime()) }}>Today</button><button className="quiet-button" onClick={() => setCursor((value) => value + (view === 'day' ? 1 : 7) * 86_400_000)}>Next</button></div><div className="segmented-control"><button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button></div></div><div className="week-strip">{Array.from({ length: view === 'day' ? 1 : 7 }, (_, index) => { const date = new Date(cursor + index * 86_400_000); const count = events.filter((item) => new Date(item.startAt).toDateString() === date.toDateString()).length; return <div key={date.toISOString()} className={date.toDateString() === new Date(now).toDateString() ? 'today' : ''}><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.getDate()}</strong><i>{count}</i></div> })}</div><section className="content-section"><div className="section-heading"><h2>Agenda</h2><span>{events.length} events</span></div><div className="ruled-list">{events.length === 0 ? <div className="empty-inline">No events in this range.</div> : events.map((event) => <CalendarItemView key={event.calendarEventId} event={event} repository={repository} onResult={onResult} />)}</div></section><LoadMore repository={repository} page="calendar" label="Load more events" /></div>
}

function CalendarItemView({ event, repository, onResult }: { event: CalendarEventItem; repository: WebRepository; onResult: ResultHandler }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <CalendarForm initial={event} busy={repository.pending.has(`calendar:${event.calendarEventId}`)} cancel={() => setEditing(false)} submit={async (draft) => { const result = await repository.updateCalendarEvent(event, draft); onResult(result, 'Event updated.'); if (result.ok) setEditing(false); return result.ok }} />
  return <article className="product-row calendar-row"><time>{new Date(event.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><div className="row-copy"><strong>{event.title}</strong><div className="metadata"><span>{new Date(event.startAt).toLocaleDateString()}</span>{event.location && <span>{event.location}</span>}<StatusPill value={event.lifecycle} /></div></div><div className="row-actions"><button className="quiet-button" onClick={() => setEditing(true)}>Edit</button><button className="quiet-button danger" onClick={async () => onResult(await repository.deleteCalendarEvent(event), 'Event deleted.')}>Delete</button></div></article>
}

export function NotesWorkspace({ repository, onResult }: { repository: WebRepository; onResult: ResultHandler }) {
  const [editing, setEditing] = useState<AppNoteItem | 'new' | null>(null)
  return <div className="notes-layout"><aside className="notes-list"><button className="primary-button" onClick={() => setEditing('new')}>New note</button>{repository.notes.map((note) => <button key={note.noteId} className={editing !== 'new' && editing?.noteId === note.noteId ? 'active' : ''} onClick={() => setEditing(note)}><strong>{note.title || 'Untitled note'}</strong><span>{note.plainTextPreview || 'Empty note'}</span><small>{note.wordCount} words · rev {note.revision}</small></button>)}<LoadMore repository={repository} page="notes" label="Load more notes" /></aside><div>{editing ? <NoteEditor key={editing === 'new' ? 'new' : editing.noteId} note={editing === 'new' ? undefined : editing} busy={repository.pending.has(editing === 'new' ? 'note:create' : `note:${editing.noteId}`)} onCancel={() => setEditing(null)} onSave={async (draft) => { const result = editing === 'new' ? await repository.createNote(draft) : await repository.updateNote(editing, draft); onResult(result, 'Note saved as validated TipTap JSON.'); if (result.ok) setEditing(null); return result.ok }} /> : <div className="note-empty"><strong>Select a note or start a new one.</strong><span>Notes keep validated TipTap JSON and a searchable plain-text preview.</span></div>}</div></div>
}

export function SourcesWorkspace({ repository, now }: { repository: WebRepository; now: number }) {
  return <div className="workspace product-workspace"><div className="honesty-note"><strong>Projection only.</strong><span>The browser receives compact source metadata from Convex. Raw transcripts, vault Markdown, and vectors stay on your personal node.</span></div><section className="content-section"><div className="section-heading"><h2>Knowledge sources</h2><span>{repository.sourceRefs.length}</span></div><div className="source-table">{repository.sourceRefs.map((source) => <article key={source.sourceRefId}><div><strong>{source.displayName}</strong><span>{source.kind} · rev {source.revision}</span></div><div><StatusPill value={source.syncState} /><StatusPill value={source.indexState} /></div><div className="metadata"><span>{source.provenanceIds.length} provenance links</span>{source.lastSyncedAt && <span>Synced {formatRelativeTime(source.lastSyncedAt, now)}</span>}</div>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a> : <span className="muted-copy">Private node reference</span>}</article>)}</div></section><LoadMore repository={repository} page="sources" label="Load more sources" /></div>
}

export function EntitiesWorkspace({ repository, onResult }: { repository: WebRepository; onResult: ResultHandler }) {
  const [question, setQuestion] = useState('')
  const sourceById = useMemo(() => new Map(repository.sourceRefs.map((source) => [source.sourceRefId, source])), [repository.sourceRefs])
  const citedEvents = repository.runEvents.filter((event) => event.data.includes('[source:'))
  return <div className="workspace product-workspace"><form className="retrieval-form" onSubmit={async (event) => { event.preventDefault(); if (!question.trim()) return; const result = await repository.submitCommand(`Answer with citations from indexed Kriyan knowledge: ${question.trim()}`); onResult(result, 'Retrieval command queued. Its cited answer will appear in Run activity.'); if (result.ok) setQuestion('') }}><label><span>Ask indexed knowledge</span><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What did we decide about the Kriyan node?" /></label><button className="primary-button" disabled={!question.trim()}>Ask node</button><p>This creates a command for the VPS node; the browser never opens vault files directly.</p></form><section className="entity-grid">{repository.knowledgeDocuments.map((document) => <article key={document.knowledgeDocumentId}><div className="entity-heading"><StatusPill value={document.kind} /><div><StatusPill value={document.syncState} /><StatusPill value={document.indexState} /></div></div><h2>{document.title}</h2><p>{document.summary}</p><div className="tag-list">{document.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="citation-list">{document.sourceRefIds.map((sourceId) => { const source = sourceById.get(sourceId); return source?.sourceUrl ? <a key={sourceId} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.displayName} ↗</a> : <span key={sourceId}>{source?.displayName ?? sourceId}</span> })}</div><small>{document.provenanceIds.length} provenance records · rev {document.revision}</small></article>)}</section>{citedEvents.length > 0 && <section className="cited-run"><div className="section-heading"><h2>Latest cited retrieval</h2><span>{citedEvents.length} cited events</span></div>{citedEvents.map((event) => <p key={event.eventId}>{event.data}</p>)}</section>}<LoadMore repository={repository} page="knowledge" label="Load more entities" /></div>
}
