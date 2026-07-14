'use client'

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import {
  createDemoAgentWorkspacePort,
} from './demo-agent-workspace-port'
import type {
  AgentDefinitionView,
  AgentMessageView,
  AgentNodeView,
  AgentRunEventView,
  AgentRunView,
  AgentThreadView,
  AgentTurnState,
  AgentWorkspacePort,
  AgentWorkspacePortResult,
  AgentWorkspacePreviewScenario,
  DemoAgentWorkspacePort,
} from './agent-workspace-port'
import styles from './agent-workspace.module.css'

const PREVIEW_SCENARIOS: Array<{ value: AgentWorkspacePreviewScenario; label: string }> = [
  { value: 'ready', label: 'Ready' },
  { value: 'loading', label: 'Loading' },
  { value: 'load_error', label: 'Load error' },
  { value: 'empty', label: 'Empty' },
  { value: 'offline', label: 'Convex offline' },
  { value: 'reconnecting', label: 'Reconnecting' },
  { value: 'node_unavailable', label: 'Node unavailable' },
  { value: 'failed', label: 'Failed run' },
  { value: 'conflict', label: 'Write conflict' },
]

const ACTIVE_RUN_STATES = new Set<AgentTurnState>(['queued', 'waiting_for_node', 'running'])

function Icon({ name }: { name: 'agent' | 'arrow' | 'check' | 'chevron' | 'clock' | 'cloud' | 'edit' | 'history' | 'node' | 'plus' | 'retry' | 'search' | 'send' | 'stop' | 'tool' | 'warning' }) {
  const paths: Record<typeof name, ReactNode> = {
    agent: <><circle cx="12" cy="8" r="3.25" /><path d="M5.75 19c.45-3.2 2.55-5 6.25-5s5.8 1.8 6.25 5" /><path d="M7 4.5 5.5 3M17 4.5 18.5 3" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    cloud: <path d="M7 18h10a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.5-1.5A4.8 4.8 0 0 0 7 18Z" />,
    edit: <><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Z" /><path d="m14.5 6.3 3.2 3.2" /></>,
    history: <><path d="M4.5 8A8 8 0 1 1 4 14" /><path d="M4.5 4v4h4" /><path d="M12 8v4l2.5 1.5" /></>,
    node: <><rect x="4" y="5" width="16" height="6" rx="2" /><rect x="4" y="13" width="16" height="6" rx="2" /><path d="M8 8h.01M8 16h.01M12 8h5M12 16h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    retry: <><path d="M19 8a7 7 0 1 0 .2 7.5" /><path d="M19 4v4h-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4.5 4.5" /></>,
    send: <><path d="m4 4 17 8-17 8 3-8-3-8Z" /><path d="M7 12h14" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    tool: <><path d="M14 6a4 4 0 0 0-5 5L4 16l4 4 5-5a4 4 0 0 0 5-5l-3 3-4-4 3-3Z" /></>,
    warning: <><path d="M12 4 3.5 19h17L12 4Z" /><path d="M12 9v4M12 16h.01" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function formatRelativeTime(timestamp: number): string {
  const delta = timestamp - Date.now()
  const absolute = Math.abs(delta)
  if (absolute < 60_000) return 'just now'
  if (absolute < 3_600_000) {
    const minutes = Math.round(absolute / 60_000)
    return delta < 0 ? `${minutes}m ago` : `in ${minutes}m`
  }
  if (absolute < 86_400_000) {
    const hours = Math.round(absolute / 3_600_000)
    return delta < 0 ? `${hours}h ago` : `in ${hours}h`
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)
}

function formatEventTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('.', ' ')
}

function StatusBadge({ state, label }: { state: string; label?: string }) {
  return <span className={styles.statusBadge} data-state={state}><i aria-hidden="true" />{label ?? humanize(state)}</span>
}

function ResultNotice({ result }: { result: { tone: 'info' | 'success' | 'warning' | 'error'; message: string } }) {
  return <div className={styles.notice} data-tone={result.tone} role={result.tone === 'error' ? 'alert' : 'status'}>
    {result.tone === 'error' || result.tone === 'warning' ? <Icon name="warning" /> : <Icon name="check" />}
    <span>{result.message}</span>
  </div>
}

function WorkspaceSkeleton() {
  return <div className={styles.skeletonGrid} aria-label="Loading agent workspace" aria-busy="true">
    {[0, 1, 2].map((column) => <div key={column} className={styles.skeletonColumn}>
      <span /><span /><span /><span />
    </div>)}
  </div>
}

function ThreadStatusLine({ thread, node }: { thread: AgentThreadView; node?: AgentNodeView }) {
  if (thread.sessionState === 'waiting_for_node') {
    return <span><Icon name="clock" />Waiting for {node?.displayName ?? 'session node'}</span>
  }
  if (thread.preferredNodeId) return <span><Icon name="node" />{node?.displayName ?? thread.preferredNodeId}</span>
  return <span><Icon name="cloud" />Portable session</span>
}

function ThreadPane({
  threads,
  nodes,
  selectedThreadId,
  search,
  onSearch,
  onSelect,
  onCreate,
  onRename,
}: {
  threads: AgentThreadView[]
  nodes: AgentNodeView[]
  selectedThreadId?: string
  search: string
  onSearch: (value: string) => void
  onSelect: (thread: AgentThreadView) => void
  onCreate: () => void
  onRename: (thread: AgentThreadView) => void
}) {
  const filtered = threads.filter((thread) => `${thread.title} ${thread.latestMessage ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <aside className={styles.threadPane} aria-label="Agent threads">
    <div className={styles.paneHeader}>
      <div><h2>Threads</h2><span>{threads.length} durable conversations</span></div>
      <button className={styles.iconButton} type="button" onClick={onCreate} aria-label="Create thread"><Icon name="plus" /></button>
    </div>
    <label className={styles.searchField}>
      <span className={styles.srOnly}>Search threads</span>
      <Icon name="search" />
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search threads" />
    </label>
    <div className={styles.threadList} role="list">
      {filtered.length === 0 ? <div className={styles.smallEmpty}>
        <strong>No matching threads</strong>
        <span>Try a different title or message.</span>
      </div> : filtered.map((thread) => {
        const node = nodes.find((item) => item.nodeId === thread.preferredNodeId)
        return <div key={thread.threadId} className={styles.threadItem} data-selected={thread.threadId === selectedThreadId} role="listitem">
          <button type="button" className={styles.threadSelect} onClick={() => onSelect(thread)} aria-current={thread.threadId === selectedThreadId ? 'page' : undefined}>
            <span className={styles.threadTitle}><strong>{thread.title}</strong><StatusBadge state={thread.state} /></span>
            <span className={styles.threadPreview}>{thread.latestMessage ?? 'No messages yet'}</span>
            <span className={styles.threadMeta}>
              <ThreadStatusLine thread={thread} node={node} />
              <time>{formatRelativeTime(thread.updatedAt)}</time>
            </span>
          </button>
          <button type="button" className={styles.renameButton} onClick={() => onRename(thread)} aria-label={`Rename ${thread.title}`}><Icon name="edit" /></button>
        </div>
      })}
    </div>
  </aside>
}

function MessageState({ state }: { state: AgentTurnState }) {
  if (state === 'completed') return null
  const copy: Record<Exclude<AgentTurnState, 'completed'>, string> = {
    queued: 'Saved · waiting to be claimed',
    waiting_for_node: 'Saved · waiting for the session node',
    running: 'Node is working',
    failed: 'Run failed',
    cancelled: 'Cancelled',
  }
  return <span className={styles.messageState} data-state={state}><i aria-hidden="true" />{copy[state]}</span>
}

function ConversationPane({
  thread,
  agent,
  messages,
  connection,
  node,
  busy,
  draft,
  onDraft,
  onSubmit,
}: {
  thread?: AgentThreadView
  agent?: AgentDefinitionView
  messages: AgentMessageView[]
  connection: 'online' | 'reconnecting' | 'offline'
  node?: AgentNodeView
  busy: boolean
  draft: string
  onDraft: (value: string) => void
  onSubmit: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ordered = [...messages].sort((left, right) => left.turnOrdinal - right.turnOrdinal || left.createdAt - right.createdAt)
  const canSend = Boolean(thread && draft.trim() && connection === 'online' && !busy)
  const unavailable = thread?.sessionState === 'waiting_for_node' && node?.state !== 'online'
  const keyboardSubmit = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSubmit()
  }
  return <section className={styles.conversationPane} aria-labelledby="conversation-title">
    <div className={styles.conversationHeader}>
      <div>
        <span className={styles.path}>Agents <Icon name="chevron" /></span>
        <h2 id="conversation-title">{thread?.title ?? 'Choose a thread'}</h2>
      </div>
      {thread && <div className={styles.pinnedRevision}>
        <Icon name="history" />
        <span>Pinned to <strong>{agent?.displayName ?? 'Agent'} r{agent?.revisions.find((item) => item.revisionId === thread.agentRevisionId)?.ordinal ?? '?'}</strong></span>
      </div>}
    </div>

    {thread ? <>
      {unavailable && <div className={styles.waitingBanner} role="status">
        <Icon name="node" />
        <div><strong>This session is waiting for {node?.displayName ?? 'its node'}.</strong><span>Kriyan will keep the turn durable and will not move a node-local Pi session without your explicit reset.</span></div>
      </div>}
      <div className={styles.messageList} aria-live="polite">
        {ordered.length === 0 ? <div className={styles.conversationEmpty}>
          <Icon name="agent" />
          <strong>Start with an outcome, not a prompt ritual.</strong>
          <span>The selected agent revision and session policy will be pinned when you send.</span>
        </div> : ordered.map((message) => <article key={message.messageId} className={styles.message} data-role={message.role}>
          <header>
            <span className={styles.messageAvatar}>{message.role === 'user' ? 'Y' : message.role === 'assistant' ? 'K' : '•'}</span>
            <strong>{message.role === 'user' ? 'You' : message.role === 'assistant' ? agent?.displayName ?? 'Agent' : humanize(message.role)}</strong>
            <time>{formatEventTime(message.createdAt)}</time>
            <span className={styles.turnOrdinal}>Turn {message.turnOrdinal}</span>
          </header>
          <p>{message.content}</p>
          <MessageState state={message.state} />
        </article>)}
      </div>
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); if (canSend) onSubmit() }}>
        <label htmlFor="agent-composer">Message {agent?.displayName ?? 'agent'}</label>
        <textarea
          ref={textareaRef}
          id="agent-composer"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={keyboardSubmit}
          placeholder={connection === 'online' ? 'Describe the outcome and the durable changes you expect…' : 'Draft preserved while Convex reconnects…'}
          rows={3}
          aria-describedby="composer-help"
          disabled={busy}
        />
        <div>
          <span id="composer-help">Enter to send · Shift+Enter for a new line</span>
          <button className={styles.primaryButton} type="submit" disabled={!canSend}>
            {busy ? <><span className={styles.spinner} />Saving</> : <><Icon name="send" />Send</>}
          </button>
        </div>
      </form>
    </> : <div className={styles.conversationEmpty}>
      <Icon name="agent" />
      <strong>Select a durable conversation.</strong>
      <span>Threads keep their pinned agent revision, message history, and session affinity.</span>
    </div>}
  </section>
}

function EventIcon({ event }: { event: AgentRunEventView }) {
  if (event.kind.startsWith('tool.')) return <Icon name="tool" />
  if (event.kind === 'effect.checkpointed' || event.kind === 'knowledge.changed') return <Icon name="check" />
  if (event.state === 'error') return <Icon name="warning" />
  return <Icon name="clock" />
}

function ToolTimeline({ run }: { run?: AgentRunView }) {
  if (!run) return <div className={styles.inspectorEmpty}><Icon name="tool" /><strong>No run selected</strong><span>Run events appear only after Convex records them.</span></div>
  const events = [...run.events].sort((left, right) => left.sequence - right.sequence)
  return <section className={styles.timelineSection} aria-labelledby="timeline-title">
    <div className={styles.inspectorHeading}><h3 id="timeline-title">Tool timeline</h3><span>{events.length} public events</span></div>
    {events.length === 0 ? <div className={styles.inspectorEmpty}>
      <Icon name="clock" />
      <strong>{run.state === 'queued' ? 'Waiting to be claimed' : 'No public events yet'}</strong>
      <span>Kriyan does not invent streaming or tool activity while a turn is only {humanize(run.state)}.</span>
    </div> : <ol className={styles.timeline}>
      {events.map((event) => <li key={event.eventId} data-state={event.state}>
        <span className={styles.eventIcon}><EventIcon event={event} /></span>
        <div>
          <div className={styles.eventTitle}><strong>{event.title}</strong><time>{formatEventTime(event.occurredAt)}</time></div>
          <p>{event.summary}</p>
          {event.detail && <details><summary>Inspect safe detail</summary><p>{event.detail}</p></details>}
        </div>
        <code>{String(event.sequence).padStart(2, '0')}</code>
      </li>)}
    </ol>}
  </section>
}

function RunInspector({
  thread,
  run,
  node,
  revisionOrdinal,
  busy,
  resetConfirm,
  onCancel,
  onRetry,
  onAskReset,
  onReset,
  onCancelReset,
}: {
  thread?: AgentThreadView
  run?: AgentRunView
  node?: AgentNodeView
  revisionOrdinal?: number
  busy: boolean
  resetConfirm: boolean
  onCancel: () => void
  onRetry: () => void
  onAskReset: () => void
  onReset: () => void
  onCancelReset: () => void
}) {
  const canCancel = Boolean(run && ACTIVE_RUN_STATES.has(run.state))
  const canRetry = Boolean(run && (run.state === 'failed' || run.state === 'cancelled') && run.attempt < run.maxAttempts)
  return <aside className={styles.inspectorPane} aria-label="Run and agent details">
    <section className={styles.runSection} aria-labelledby="run-title">
      <div className={styles.inspectorHeading}><h3 id="run-title">Active run</h3>{run && <StatusBadge state={run.state} />}</div>
      {run ? <>
        <dl className={styles.runFacts}>
          <div><dt>Node</dt><dd>{node?.displayName ?? (run.nodeId ? 'Unknown node' : 'Unassigned')}</dd></div>
          <div><dt>Presence</dt><dd><StatusBadge state={node?.state ?? 'unassigned'} /></dd></div>
          <div><dt>Attempt</dt><dd>{run.attempt} of {run.maxAttempts}</dd></div>
          <div><dt>Agent</dt><dd>Revision {revisionOrdinal ?? '?'}</dd></div>
          <div><dt>Session</dt><dd>{run.sessionId ? `Pinned · r${run.sessionRevision}` : 'Portable'}</dd></div>
          <div><dt>Updated</dt><dd>{formatRelativeTime(run.updatedAt)}</dd></div>
        </dl>
        {run.errorMessage && <div className={styles.runError} role="alert"><Icon name="warning" /><span>{run.errorMessage}</span></div>}
        <div className={styles.runActions}>
          <button className={styles.secondaryButton} type="button" disabled={!canCancel || busy} onClick={onCancel}><Icon name="stop" />Cancel</button>
          <button className={styles.secondaryButton} type="button" disabled={!canRetry || busy} onClick={onRetry}><Icon name="retry" />Retry</button>
          <button className={styles.textButton} type="button" disabled={!thread || busy} onClick={onAskReset}>Reset session</button>
        </div>
        {resetConfirm && <div className={styles.inlineConfirm} role="group" aria-labelledby="reset-session-title" aria-describedby="reset-session-copy">
          <strong id="reset-session-title">Detach this Pi session?</strong>
          <span id="reset-session-copy">Durable messages stay here. The next turn starts a fresh portable session and cannot recover node-local context.</span>
          <div><button className={styles.dangerButton} type="button" onClick={onReset} disabled={busy}>Reset session</button><button className={styles.textButton} type="button" onClick={onCancelReset}>Keep session</button></div>
        </div>}
      </> : <div className={styles.inspectorEmpty}><Icon name="clock" /><strong>No run for this thread</strong><span>Send a turn to create a durable queued run.</span></div>}
    </section>
    <ToolTimeline run={run} />
  </aside>
}

function AgentDetails({
  agent,
  onRevise,
  busy,
}: {
  agent?: AgentDefinitionView
  onRevise: (name: string, summary: string, capabilities: string[]) => Promise<boolean>
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(agent?.displayName ?? '')
  const [summary, setSummary] = useState(agent?.revisions[0]?.systemPromptSummary ?? '')
  const [capabilities, setCapabilities] = useState(agent?.revisions[0]?.toolCapabilities.join(', ') ?? '')

  if (!agent) return null
  const current = agent.revisions.find((item) => item.revisionId === agent.currentRevisionId) ?? agent.revisions[0]
  return <details className={styles.agentDetails}>
    <summary><span><Icon name="agent" /><strong>{agent.displayName}</strong><small>Current revision {current?.ordinal ?? agent.revision}</small></span><span>Definition <Icon name="chevron" /></span></summary>
    <div className={styles.agentDetailsBody}>
      {!editing ? <>
        <div className={styles.promptSummary}><span>Instruction summary</span><p>{current?.systemPromptSummary}</p></div>
        <div className={styles.capabilityList} aria-label="Tool capabilities">{current?.toolCapabilities.map((capability) => <code key={capability}>{capability}</code>)}</div>
        <button className={styles.secondaryButton} type="button" onClick={() => setEditing(true)}><Icon name="plus" />Draft new revision</button>
      </> : <form className={styles.revisionForm} onSubmit={async (event) => {
        event.preventDefault()
        const ok = await onRevise(name, summary, capabilities.split(',').map((item) => item.trim()).filter(Boolean))
        if (ok) setEditing(false)
      }}>
        <label><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label><span>Instruction summary</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} required /></label>
        <label><span>Tool capabilities</span><input value={capabilities} onChange={(event) => setCapabilities(event.target.value)} placeholder="task.write, note.read" /></label>
        <p>Publishing creates revision {agent.revision + 1}. Existing threads remain pinned.</p>
        <div><button className={styles.primaryButton} disabled={busy}>Publish revision</button><button className={styles.textButton} type="button" onClick={() => setEditing(false)}>Cancel</button></div>
      </form>}
      <div className={styles.revisionHistory}>
        <span>Immutable history</span>
        {agent.revisions.map((revision) => <div key={revision.revisionId}><strong>r{revision.ordinal}</strong><span>{revision.systemPromptSummary}</span><time>{formatRelativeTime(revision.createdAt)}</time></div>)}
      </div>
    </div>
  </details>
}

export function AgentWorkspace({ port }: { port: AgentWorkspacePort }): ReactNode {
  const snapshot = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot)
  const [selectedThreadId, setSelectedThreadId] = useState(snapshot.threads[0]?.threadId)
  const [selectedAgentId, setSelectedAgentId] = useState(snapshot.agents[0]?.agentId)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [busyAction, setBusyAction] = useState<string>()
  const [localNotice, setLocalNotice] = useState<AgentWorkspaceSnapshotNotice>()
  const [newThreadOpen, setNewThreadOpen] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [renameThread, setRenameThread] = useState<AgentThreadView>()
  const [renameTitle, setRenameTitle] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'threads' | 'conversation' | 'run'>('conversation')
  const requestSequence = useRef(0)

  type SnapshotThread = typeof snapshot.threads[number]
  type SnapshotRun = typeof snapshot.runs[number]

  const effectiveThreadId = snapshot.threads.some((thread) => thread.threadId === selectedThreadId)
    ? selectedThreadId
    : snapshot.threads[0]?.threadId
  const effectiveAgentId = snapshot.agents.some((agent) => agent.agentId === selectedAgentId)
    ? selectedAgentId
    : snapshot.agents[0]?.agentId
  const selectedThread = snapshot.threads.find((thread) => thread.threadId === effectiveThreadId)
  const selectedAgent = snapshot.agents.find((agent) => agent.agentId === (selectedThread?.agentId ?? effectiveAgentId))
  const selectedRun = useMemo(() => {
    if (!selectedThread) return undefined
    if (selectedThread.activeRunId) {
      const active = snapshot.runs.find((run) => run.runId === selectedThread.activeRunId)
      if (active) return active
    }
    return snapshot.runs
      .filter((run) => run.threadId === selectedThread.threadId)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  }, [selectedThread, snapshot.runs])
  const selectedNode = snapshot.nodes.find((node) => node.nodeId === (selectedRun?.nodeId ?? selectedThread?.preferredNodeId))
  const messages = snapshot.messages.filter((message) => message.threadId === effectiveThreadId)
  const notice = localNotice ?? snapshot.operationNotice

  const handleResult = <T,>(result: AgentWorkspacePortResult<T>, successMessage?: string): result is { ok: true; value: T } => {
    if (!result.ok) {
      setLocalNotice({ tone: result.code === 'offline' ? 'warning' : 'error', message: result.message })
      return false
    }
    setLocalNotice(successMessage ? { tone: 'success', message: successMessage } : undefined)
    return true
  }

  const runAction = async <T,>(key: string, action: () => Promise<AgentWorkspacePortResult<T>>, successMessage?: string): Promise<AgentWorkspacePortResult<T>> => {
    setBusyAction(key)
    try {
      const result = await action()
      handleResult(result, successMessage)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The operation failed unexpectedly.'
      const result = { ok: false as const, code: 'conflict' as const, message }
      handleResult(result)
      return result
    } finally {
      setBusyAction(undefined)
    }
  }

  const createThread = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!effectiveAgentId) return
    const result = await runAction('create-thread', () => port.createThread({ title: newThreadTitle, agentId: effectiveAgentId }), 'Thread created.')
    if (result.ok) {
      setSelectedThreadId(result.value.threadId)
      setNewThreadTitle('')
      setNewThreadOpen(false)
      setMobilePanel('conversation')
    }
  }

  const submitMessage = async (): Promise<void> => {
    if (!selectedThread || !draft.trim() || busyAction) return
    const content = draft
    const requestId = `web:${selectedThread.threadId}:${Date.now()}:${++requestSequence.current}`
    const result = await runAction('submit-message', () => port.submitMessage({ threadId: selectedThread.threadId, content, clientRequestId: requestId }))
    if (result.ok) setDraft('')
  }

  const demoPort = snapshot.mode === 'demo' ? port as DemoAgentWorkspacePort : undefined
  const revisionOrdinal = selectedAgent?.revisions.find((revision) => revision.revisionId === selectedRun?.agentRevisionId)?.ordinal

  return <main className={styles.page}>
    <header className={styles.productHeader}>
      <div className={styles.productIdentity}>
        <span className={styles.productMark}><Icon name="agent" /></span>
        <div><strong>Kriyan agents</strong><span>Durable work, visible state</span></div>
      </div>
      <div className={styles.headerControls}>
        <div className={styles.connectionGroup}>
          <StatusBadge state={snapshot.connection} label={`Convex ${snapshot.connection}`} />
          <span className={styles.connectionDetail}>{snapshot.connectionDetail}</span>
        </div>
        {demoPort && <label className={styles.previewControl}>
          <span>Preview state</span>
          <select value={snapshot.previewScenario ?? 'ready'} onChange={(event) => { setLocalNotice(undefined); demoPort.setPreviewScenario(event.target.value as AgentWorkspacePreviewScenario) }}>
            {PREVIEW_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
          </select>
        </label>}
      </div>
    </header>

    <div className={styles.workspaceIntro}>
      <div><p>Do the work</p><h1>Agent workspace</h1><span>Choose an agent, keep each conversation durable, and inspect what the runtime actually did.</span></div>
      <div className={styles.agentChooser}>
        <label><span>Agent for new threads</span><select value={effectiveAgentId ?? ''} onChange={(event) => setSelectedAgentId(event.target.value)} disabled={snapshot.agents.length === 0}>{snapshot.agents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.displayName} · r{agent.revision}</option>)}</select></label>
        <button className={styles.primaryButton} type="button" onClick={() => setNewThreadOpen(true)} disabled={snapshot.agents.length === 0}><Icon name="plus" />New thread</button>
      </div>
    </div>

    {snapshot.mode === 'demo' && <div className={styles.demoDisclosure}><strong>Deterministic preview</strong><span>This route demonstrates the integration contract. It does not contact Convex or a node until the integration owner supplies the live port.</span></div>}
    {notice && <ResultNotice result={notice} />}

    {newThreadOpen && <form className={styles.inlineForm} onSubmit={createThread}>
      <label><span>Thread title</span><input autoFocus value={newThreadTitle} onChange={(event) => setNewThreadTitle(event.target.value)} placeholder="What outcome will this conversation own?" required /></label>
      <button className={styles.primaryButton} disabled={busyAction === 'create-thread' || !newThreadTitle.trim()}>Create thread</button>
      <button className={styles.textButton} type="button" onClick={() => setNewThreadOpen(false)}>Cancel</button>
    </form>}

    {renameThread && <form className={styles.inlineForm} onSubmit={async (event) => {
      event.preventDefault()
      const result = await runAction('rename-thread', () => port.renameThread(renameThread.threadId, renameTitle), 'Thread renamed.')
      if (result.ok) setRenameThread(undefined)
    }}>
      <label><span>Rename thread</span><input autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} required /></label>
      <button className={styles.primaryButton} disabled={busyAction === 'rename-thread' || !renameTitle.trim()}>Save title</button>
      <button className={styles.textButton} type="button" onClick={() => setRenameThread(undefined)}>Cancel</button>
    </form>}

    <AgentDetails key={`${effectiveAgentId ?? 'none'}:${snapshot.agents.find((agent) => agent.agentId === effectiveAgentId)?.currentRevisionId ?? 'none'}`} agent={snapshot.agents.find((agent) => agent.agentId === effectiveAgentId)} busy={busyAction === 'revise-agent'} onRevise={async (displayName, systemPromptSummary, toolCapabilities) => {
      if (!effectiveAgentId) return false
      const result = await runAction('revise-agent', () => port.reviseAgent({ agentId: effectiveAgentId, displayName, systemPromptSummary, toolCapabilities }))
      return result.ok
    }} />

    <nav className={styles.mobileTabs} aria-label="Agent workspace panels">
      {(['threads', 'conversation', 'run'] as const).map((panel) => <button key={panel} type="button" data-active={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{panel === 'run' ? 'Run detail' : panel[0].toUpperCase() + panel.slice(1)}</button>)}
    </nav>

    {snapshot.loadState === 'loading' ? <WorkspaceSkeleton /> : snapshot.loadState === 'error' ? <div className={styles.fullState}>
      <Icon name="warning" /><h2>Agent workspace did not load</h2><p>{snapshot.operationNotice?.message ?? 'The current subscription snapshot is unavailable.'}</p><button className={styles.primaryButton} type="button" onClick={() => void runAction('refresh', () => port.refresh())} disabled={busyAction === 'refresh'}><Icon name="retry" />Retry</button>
    </div> : snapshot.loadState === 'empty' ? <div className={styles.fullState}>
      <Icon name="agent" /><h2>No agent definitions yet</h2><p>Add the first immutable agent revision through the live adapter, then start a durable thread. This empty state intentionally does not invent an agent.</p>
    </div> : <div className={styles.workspaceGrid} data-mobile-panel={mobilePanel}>
      <ThreadPane
        threads={snapshot.threads}
        nodes={snapshot.nodes}
        selectedThreadId={effectiveThreadId}
        search={search}
        onSearch={setSearch}
        onCreate={() => setNewThreadOpen(true)}
        onSelect={(thread: SnapshotThread) => { setSelectedThreadId(thread.threadId); setSelectedAgentId(thread.agentId); setResetConfirm(false); setLocalNotice(undefined); setMobilePanel('conversation') }}
        onRename={(thread: SnapshotThread) => { setRenameThread(thread); setRenameTitle(thread.title) }}
      />
      <ConversationPane
        thread={selectedThread}
        agent={selectedAgent}
        messages={messages}
        connection={snapshot.connection}
        node={selectedNode}
        busy={busyAction === 'submit-message'}
        draft={draft}
        onDraft={setDraft}
        onSubmit={() => void submitMessage()}
      />
      <RunInspector
        thread={selectedThread}
        run={selectedRun as SnapshotRun | undefined}
        node={selectedNode}
        revisionOrdinal={revisionOrdinal}
        busy={Boolean(busyAction)}
        resetConfirm={resetConfirm}
        onCancel={() => selectedRun && void runAction('cancel-run', () => port.cancelRun(selectedRun.runId))}
        onRetry={() => selectedRun && void runAction('retry-run', () => port.retryRun(selectedRun.runId))}
        onAskReset={() => setResetConfirm(true)}
        onCancelReset={() => setResetConfirm(false)}
        onReset={() => selectedThread && void (async () => {
          const result = await runAction('reset-session', () => port.resetSession(selectedThread.threadId))
          if (result.ok) setResetConfirm(false)
        })()}
      />
    </div>}
  </main>
}

type AgentWorkspaceSnapshotNotice = {
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export function AgentWorkspaceDemo(): ReactNode {
  const [port] = useState(() => createDemoAgentWorkspacePort())
  return <AgentWorkspace port={port} />
}
