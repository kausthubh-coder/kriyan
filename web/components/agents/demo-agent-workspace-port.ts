import type {
  AgentDefinitionView,
  AgentMessageView,
  AgentRunView,
  AgentThreadView,
  AgentWorkspacePortErrorCode,
  AgentWorkspacePortResult,
  AgentWorkspacePreviewScenario,
  AgentWorkspaceSnapshot,
  CreateAgentInput,
  CreateAgentThreadInput,
  DemoAgentWorkspacePort,
  ReviseAgentInput,
  SubmitAgentMessageInput,
} from './agent-workspace-port'

const ACTIVE_STATES = new Set(['queued', 'waiting_for_node', 'running'])

function success<T>(value: T): AgentWorkspacePortResult<T> {
  return { ok: true, value }
}

function failure(
  code: AgentWorkspacePortErrorCode,
  message: string,
): AgentWorkspacePortResult<never> {
  return { ok: false, code, message }
}

function initialSnapshot(): AgentWorkspaceSnapshot {
  const now = Date.now()
  const minute = 60_000
  const agents: AgentDefinitionView[] = [
    {
      agentId: 'agent:kriyan',
      displayName: 'Kriyan',
      currentRevisionId: 'agent-revision:kriyan:3',
      revision: 3,
      revisions: [
        {
          revisionId: 'agent-revision:kriyan:3',
          ordinal: 3,
          displayName: 'Kriyan',
          systemPromptSummary: 'Operate the personal OS, connect durable work, and leave cited outcomes.',
          toolCapabilities: ['task.write', 'reminder.write', 'note.read', 'source.search', 'knowledge.write'],
          createdAt: now - 18 * minute,
        },
        {
          revisionId: 'agent-revision:kriyan:2',
          ordinal: 2,
          displayName: 'Kriyan',
          systemPromptSummary: 'Keep plans current and connect useful source context.',
          toolCapabilities: ['task.write', 'reminder.write', 'note.read', 'source.search'],
          createdAt: now - 4 * 24 * 60 * minute,
        },
        {
          revisionId: 'agent-revision:kriyan:1',
          ordinal: 1,
          displayName: 'Kriyan',
          systemPromptSummary: 'Help the owner stay on track.',
          toolCapabilities: ['task.write', 'reminder.write'],
          createdAt: now - 12 * 24 * 60 * minute,
        },
      ],
    },
    {
      agentId: 'agent:research',
      displayName: 'Research desk',
      currentRevisionId: 'agent-revision:research:1',
      revision: 1,
      revisions: [
        {
          revisionId: 'agent-revision:research:1',
          ordinal: 1,
          displayName: 'Research desk',
          systemPromptSummary: 'Inspect references, compare evidence, and preserve citations.',
          toolCapabilities: ['note.read', 'source.search', 'knowledge.write'],
          createdAt: now - 7 * 24 * 60 * minute,
        },
      ],
    },
  ]

  const threads: AgentThreadView[] = [
    {
      threadId: 'thread:korean',
      agentId: 'agent:kriyan',
      agentRevisionId: 'agent-revision:kriyan:2',
      title: 'Korean learning loop',
      latestMessage: 'Checking the latest study notes before updating the plan.',
      latestMessageAt: now - 2 * minute,
      state: 'running',
      preferredNodeId: 'node:atlas',
      activeRunId: 'run:korean:7',
      sessionRevision: 4,
      sessionState: 'active',
      createdAt: now - 9 * 24 * 60 * minute,
      updatedAt: now - 2 * minute,
    },
    {
      threadId: 'thread:weekly',
      agentId: 'agent:kriyan',
      agentRevisionId: 'agent-revision:kriyan:3',
      title: 'Weekly reset',
      latestMessage: 'Your review note and three next actions are ready.',
      latestMessageAt: now - 74 * minute,
      state: 'completed',
      sessionRevision: 1,
      sessionState: 'portable',
      createdAt: now - 3 * 24 * 60 * minute,
      updatedAt: now - 74 * minute,
    },
    {
      threadId: 'thread:travel',
      agentId: 'agent:research',
      agentRevisionId: 'agent-revision:research:1',
      title: 'Seoul reference pass',
      latestMessage: 'The source request failed before any durable change was made.',
      latestMessageAt: now - 5 * 60 * minute,
      state: 'failed',
      preferredNodeId: 'node:archive',
      activeRunId: 'run:travel:2',
      sessionRevision: 2,
      sessionState: 'waiting_for_node',
      createdAt: now - 2 * 24 * 60 * minute,
      updatedAt: now - 5 * 60 * minute,
    },
  ]

  const messages: AgentMessageView[] = [
    {
      messageId: 'message:korean:5:user',
      threadId: 'thread:korean',
      turnId: 'turn:korean:5',
      turnOrdinal: 5,
      role: 'user',
      state: 'completed',
      content: 'Turn my scattered Korean notes into a realistic weekly study rhythm.',
      origin: 'owner',
      agentRevisionId: 'agent-revision:kriyan:2',
      createdAt: now - 34 * minute,
      updatedAt: now - 34 * minute,
    },
    {
      messageId: 'message:korean:5:assistant',
      threadId: 'thread:korean',
      turnId: 'turn:korean:5',
      turnOrdinal: 5,
      role: 'assistant',
      state: 'completed',
      content: 'I grouped the material into listening, vocabulary, and speaking blocks, then linked each block to its source note.',
      origin: 'agent',
      agentRevisionId: 'agent-revision:kriyan:2',
      createdAt: now - 29 * minute,
      updatedAt: now - 29 * minute,
    },
    {
      messageId: 'message:korean:6:user',
      threadId: 'thread:korean',
      turnId: 'turn:korean:6',
      turnOrdinal: 6,
      role: 'user',
      state: 'completed',
      content: 'Schedule the first week and keep the sessions under forty minutes.',
      origin: 'owner',
      agentRevisionId: 'agent-revision:kriyan:2',
      createdAt: now - 21 * minute,
      updatedAt: now - 21 * minute,
    },
    {
      messageId: 'message:korean:6:assistant',
      threadId: 'thread:korean',
      turnId: 'turn:korean:6',
      turnOrdinal: 6,
      role: 'assistant',
      state: 'completed',
      content: 'Four focused sessions are on the calendar, each with a linked task and the note that supports it.',
      origin: 'agent',
      agentRevisionId: 'agent-revision:kriyan:2',
      createdAt: now - 17 * minute,
      updatedAt: now - 17 * minute,
    },
    {
      messageId: 'message:korean:7:user',
      threadId: 'thread:korean',
      turnId: 'turn:korean:7',
      turnOrdinal: 7,
      role: 'user',
      state: 'running',
      content: 'Check whether my newest notes change the plan, then update only what needs to move.',
      origin: 'owner',
      agentRevisionId: 'agent-revision:kriyan:2',
      createdAt: now - 8 * minute,
      updatedAt: now - 2 * minute,
    },
    {
      messageId: 'message:weekly:1:user',
      threadId: 'thread:weekly',
      turnId: 'turn:weekly:1',
      turnOrdinal: 1,
      role: 'user',
      state: 'completed',
      content: 'Prepare my weekly review.',
      origin: 'owner',
      agentRevisionId: 'agent-revision:kriyan:3',
      createdAt: now - 82 * minute,
      updatedAt: now - 82 * minute,
    },
    {
      messageId: 'message:weekly:1:assistant',
      threadId: 'thread:weekly',
      turnId: 'turn:weekly:1',
      turnOrdinal: 1,
      role: 'assistant',
      state: 'completed',
      content: 'Your review note and three next actions are ready.',
      origin: 'agent',
      agentRevisionId: 'agent-revision:kriyan:3',
      createdAt: now - 74 * minute,
      updatedAt: now - 74 * minute,
    },
    {
      messageId: 'message:travel:2:user',
      threadId: 'thread:travel',
      turnId: 'turn:travel:2',
      turnOrdinal: 2,
      role: 'user',
      state: 'failed',
      content: 'Compare the saved neighborhood notes and flag anything outdated.',
      origin: 'owner',
      agentRevisionId: 'agent-revision:research:1',
      createdAt: now - 8 * 60 * minute,
      updatedAt: now - 5 * 60 * minute,
    },
  ]

  const runs: AgentRunView[] = [
    {
      runId: 'run:korean:7',
      threadId: 'thread:korean',
      turnId: 'turn:korean:7',
      state: 'running',
      attempt: 1,
      maxAttempts: 3,
      agentRevisionId: 'agent-revision:kriyan:2',
      nodeId: 'node:atlas',
      sessionId: 'pi-session:atlas:korean',
      sessionRevision: 4,
      startedAt: now - 7 * minute,
      updatedAt: now - 2 * minute,
      events: [
        {
          eventId: 'event:korean:7:1',
          runId: 'run:korean:7',
          sequence: 1,
          kind: 'run.claimed',
          title: 'Run claimed',
          summary: 'Atlas accepted the next FIFO turn for this thread.',
          detail: 'Lease and installation identifiers are withheld from the public event.',
          state: 'success',
          occurredAt: now - 7 * minute,
        },
        {
          eventId: 'event:korean:7:2',
          runId: 'run:korean:7',
          sequence: 2,
          kind: 'run.started',
          title: 'Pi session resumed',
          summary: 'Resumed session revision 4 with agent revision 2 pinned.',
          detail: 'Provider credentials and the node-local session path never enter Convex.',
          state: 'success',
          occurredAt: now - 6.8 * minute,
        },
        {
          eventId: 'event:korean:7:3',
          runId: 'run:korean:7',
          sequence: 3,
          kind: 'tool.started',
          title: 'Searching sources',
          summary: 'source.search · newest Korean study material',
          detail: 'Arguments are summarized and redacted; raw source contents remain on the node.',
          state: 'active',
          occurredAt: now - 5 * minute,
        },
        {
          eventId: 'event:korean:7:4',
          runId: 'run:korean:7',
          sequence: 4,
          kind: 'tool.finished',
          title: 'Source search finished',
          summary: 'Matched 3 cited excerpts across 2 source references.',
          detail: 'The public result includes identifiers and counts, not transcript bodies.',
          state: 'success',
          occurredAt: now - 4 * minute,
        },
        {
          eventId: 'event:korean:7:5',
          runId: 'run:korean:7',
          sequence: 5,
          kind: 'effect.checkpointed',
          title: 'Durable effect checkpoint',
          summary: 'calendar.update · effect recorded before finalization',
          detail: 'Idempotency key is retained by the runtime but omitted from the public payload.',
          state: 'success',
          occurredAt: now - 3 * minute,
        },
        {
          eventId: 'event:korean:7:6',
          runId: 'run:korean:7',
          sequence: 6,
          kind: 'knowledge.changed',
          title: 'Knowledge link prepared',
          summary: 'Linked the schedule change to one cited study note.',
          detail: 'The derived change remains inspectable and reversible in Memory.',
          state: 'active',
          occurredAt: now - 2 * minute,
        },
      ],
    },
    {
      runId: 'run:travel:2',
      threadId: 'thread:travel',
      turnId: 'turn:travel:2',
      state: 'failed',
      attempt: 2,
      maxAttempts: 3,
      agentRevisionId: 'agent-revision:research:1',
      nodeId: 'node:archive',
      sessionId: 'pi-session:archive:travel',
      sessionRevision: 2,
      startedAt: now - 8 * 60 * minute,
      updatedAt: now - 5 * 60 * minute,
      errorMessage: 'The session-bound node stopped responding before a durable effect began.',
      events: [
        {
          eventId: 'event:travel:2:1',
          runId: 'run:travel:2',
          sequence: 1,
          kind: 'run.claimed',
          title: 'Run claimed',
          summary: 'Archive resumed the thread-bound session.',
          state: 'success',
          occurredAt: now - 8 * 60 * minute,
        },
        {
          eventId: 'event:travel:2:2',
          runId: 'run:travel:2',
          sequence: 2,
          kind: 'run.failed',
          title: 'Node became unavailable',
          summary: 'No durable effect was committed; retry remains safe.',
          detail: 'The thread will not migrate silently because its Pi session is node-local.',
          state: 'error',
          occurredAt: now - 5 * 60 * minute,
        },
      ],
    },
  ]

  return {
    mode: 'demo',
    loadState: 'ready',
    connection: 'online',
    connectionDetail: 'Convex subscription is connected in this deterministic preview.',
    previewScenario: 'ready',
    agents,
    threads,
    messages,
    runs,
    nodes: [
      {
        nodeId: 'node:atlas',
        displayName: 'Atlas VPS',
        state: 'online',
        lastSeenAt: now - 22_000,
        capabilities: ['agent.chat.v1', 'task.write', 'reminder.write', 'note.read', 'source.search', 'knowledge.write'],
      },
      {
        nodeId: 'node:archive',
        displayName: 'Archive Mac',
        state: 'stale',
        lastSeenAt: now - 5 * 60 * minute,
        capabilities: ['agent.chat.v1', 'note.read', 'source.search'],
      },
      {
        nodeId: 'node:old',
        displayName: 'Retired runner',
        state: 'revoked',
        lastSeenAt: now - 19 * 24 * 60 * minute,
        capabilities: ['agent.chat.v1'],
      },
    ],
  }
}

export class DeterministicAgentWorkspacePort implements DemoAgentWorkspacePort {
  private canonical = initialSnapshot()
  private snapshot = structuredClone(this.canonical)
  private scenario: AgentWorkspacePreviewScenario = 'ready'
  private readonly listeners = new Set<() => void>()
  private readonly submissions = new Map<string, { fingerprint: string; runId: string }>()
  private sequence = 20

  getSnapshot = (): AgentWorkspaceSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setPreviewScenario = (scenario: AgentWorkspacePreviewScenario): void => {
    this.scenario = scenario
    this.publish()
  }

  refresh = async (): Promise<AgentWorkspacePortResult> => {
    this.scenario = 'ready'
    this.publish({ tone: 'success', message: 'The deterministic workspace recovered.' })
    return success(undefined)
  }

  createAgent = async (
    input: CreateAgentInput,
  ): Promise<AgentWorkspacePortResult<AgentDefinitionView>> => {
    const displayName = input.displayName.trim()
    const systemPromptSummary = input.systemPromptSummary.trim()
    if (!displayName || !systemPromptSummary) {
      return failure('invalid_input', 'A name and instruction summary are required.')
    }
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const slug = displayName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `agent-${this.sequence + 1}`
    const agentId = `agent:demo:${slug}:${++this.sequence}`
    const revisionId = `agent-revision:demo:${++this.sequence}`
    const createdAt = Date.now()
    const agent: AgentDefinitionView = {
      agentId,
      displayName,
      currentRevisionId: revisionId,
      revision: 0,
      revisions: [{
        revisionId,
        ordinal: 0,
        displayName,
        systemPromptSummary,
        toolCapabilities: [...new Set(input.toolCapabilities.map((item) => item.trim()).filter(Boolean))],
        createdAt,
      }],
    }
    this.canonical = { ...this.canonical, agents: [agent, ...this.canonical.agents] }
    if (this.scenario === 'empty') this.scenario = 'ready'
    this.publish({ tone: 'success', message: `${displayName} is ready for its first durable thread.` })
    return success(agent)
  }

  createThread = async (
    input: CreateAgentThreadInput,
  ): Promise<AgentWorkspacePortResult<AgentThreadView>> => {
    if (!input.title.trim()) return failure('invalid_input', 'Give the thread a title.')
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const agent = this.canonical.agents.find((item) => item.agentId === input.agentId)
    if (!agent) return failure('not_found', 'The selected agent no longer exists.')
    const now = Date.now()
    const thread: AgentThreadView = {
      threadId: `thread:demo:${++this.sequence}`,
      agentId: agent.agentId,
      agentRevisionId: agent.currentRevisionId,
      title: input.title.trim(),
      state: input.preferredNodeId ? 'waiting_for_node' : 'queued',
      preferredNodeId: input.preferredNodeId,
      sessionRevision: 0,
      sessionState: input.preferredNodeId ? 'waiting_for_node' : 'portable',
      createdAt: now,
      updatedAt: now,
    }
    this.canonical = {
      ...this.canonical,
      threads: [thread, ...this.canonical.threads],
    }
    this.publish({ tone: 'success', message: `Created “${thread.title}” on ${agent.displayName} revision ${agent.revision}.` })
    return success(thread)
  }

  renameThread = async (
    threadId: string,
    title: string,
  ): Promise<AgentWorkspacePortResult<AgentThreadView>> => {
    if (!title.trim()) return failure('invalid_input', 'A thread title cannot be empty.')
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const current = this.canonical.threads.find((item) => item.threadId === threadId)
    if (!current) return failure('not_found', 'The thread no longer exists.')
    const updated = { ...current, title: title.trim(), updatedAt: Date.now() }
    this.canonical = {
      ...this.canonical,
      threads: this.canonical.threads.map((item) => item.threadId === threadId ? updated : item),
    }
    this.publish({ tone: 'success', message: 'Thread title saved.' })
    return success(updated)
  }

  reviseAgent = async (
    input: ReviseAgentInput,
  ): Promise<AgentWorkspacePortResult<AgentDefinitionView>> => {
    if (!input.displayName.trim() || !input.systemPromptSummary.trim()) {
      return failure('invalid_input', 'A name and instruction summary are required.')
    }
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const current = this.canonical.agents.find((item) => item.agentId === input.agentId)
    if (!current) return failure('not_found', 'The agent no longer exists.')
    const ordinal = current.revision + 1
    const revisionId = `agent-revision:${current.agentId.replace('agent:', '')}:${ordinal}`
    const revision = {
      revisionId,
      ordinal,
      displayName: input.displayName.trim(),
      systemPromptSummary: input.systemPromptSummary.trim(),
      toolCapabilities: [...new Set(input.toolCapabilities.map((item) => item.trim()).filter(Boolean))],
      createdAt: Date.now(),
    }
    const updated: AgentDefinitionView = {
      ...current,
      displayName: revision.displayName,
      currentRevisionId: revisionId,
      revision: ordinal,
      revisions: [revision, ...current.revisions],
    }
    this.canonical = {
      ...this.canonical,
      agents: this.canonical.agents.map((item) => item.agentId === input.agentId ? updated : item),
    }
    this.publish({
      tone: 'success',
      message: `Published revision ${ordinal}. Existing threads remain pinned to their original revision.`,
    })
    return success(updated)
  }

  submitMessage = async (
    input: SubmitAgentMessageInput,
  ): Promise<AgentWorkspacePortResult<AgentRunView>> => {
    const content = input.content.trim()
    if (!content) return failure('invalid_input', 'Write a message before sending.')
    const fingerprint = `${input.threadId}\u0000${content}`
    const prior = this.submissions.get(input.clientRequestId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return failure('conflict', 'That request identity is already attached to different content.')
      }
      const priorRun = this.canonical.runs.find((item) => item.runId === prior.runId)
      return priorRun ? success(priorRun) : failure('not_found', 'The original run is no longer available.')
    }
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const thread = this.canonical.threads.find((item) => item.threadId === input.threadId)
    if (!thread) return failure('not_found', 'The selected thread no longer exists.')
    const activeRun = thread.activeRunId
      ? this.canonical.runs.find((item) => item.runId === thread.activeRunId)
      : undefined
    if (activeRun && ACTIVE_STATES.has(activeRun.state)) {
      return failure('conflict', 'This thread already has an active turn. Wait, cancel it, or use another thread.')
    }

    const now = Date.now()
    const ordinal = Math.max(
      0,
      ...this.canonical.messages
        .filter((item) => item.threadId === thread.threadId)
        .map((item) => item.turnOrdinal),
    ) + 1
    const turnId = `turn:demo:${++this.sequence}`
    const runId = `run:demo:${++this.sequence}`
    const preferredNode = thread.preferredNodeId
      ? this.canonical.nodes.find((item) => item.nodeId === thread.preferredNodeId)
      : undefined
    const waitsForNode = thread.preferredNodeId !== undefined
    const state = waitsForNode ? 'waiting_for_node' : 'queued'
    const message: AgentMessageView = {
      messageId: `message:demo:${++this.sequence}:user`,
      threadId: thread.threadId,
      turnId,
      turnOrdinal: ordinal,
      role: 'user',
      state,
      content,
      origin: 'owner',
      agentRevisionId: thread.agentRevisionId,
      createdAt: now,
      updatedAt: now,
    }
    const run: AgentRunView = {
      runId,
      threadId: thread.threadId,
      turnId,
      state,
      attempt: 0,
      maxAttempts: 3,
      agentRevisionId: thread.agentRevisionId,
      nodeId: preferredNode?.nodeId,
      sessionId: waitsForNode ? `pi-session:${thread.threadId}` : undefined,
      sessionRevision: thread.sessionRevision,
      updatedAt: now,
      events: [],
    }
    const updatedThread: AgentThreadView = {
      ...thread,
      latestMessage: content,
      latestMessageAt: now,
      state,
      activeRunId: runId,
      sessionState: waitsForNode ? 'waiting_for_node' : thread.sessionState,
      updatedAt: now,
    }
    this.submissions.set(input.clientRequestId, { fingerprint, runId })
    this.canonical = {
      ...this.canonical,
      threads: this.canonical.threads.map((item) => item.threadId === thread.threadId ? updatedThread : item),
      messages: [...this.canonical.messages, message],
      runs: [run, ...this.canonical.runs],
    }
    this.publish({
      tone: waitsForNode ? 'warning' : 'info',
      message: waitsForNode
        ? 'Turn saved. It will wait for the session-bound node; Kriyan will not migrate it silently.'
        : 'Turn saved in Convex and queued. No agent output is shown until a node claims it.',
    })
    return success(run)
  }

  cancelRun = async (runId: string): Promise<AgentWorkspacePortResult<AgentRunView>> => {
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const current = this.canonical.runs.find((item) => item.runId === runId)
    if (!current) return failure('not_found', 'The run no longer exists.')
    if (!ACTIVE_STATES.has(current.state)) return failure('conflict', 'Only an active or queued run can be cancelled.')
    const now = Date.now()
    const updated: AgentRunView = {
      ...current,
      state: 'cancelled',
      updatedAt: now,
      events: [
        ...current.events,
        {
          eventId: `event:demo:${++this.sequence}`,
          runId,
          sequence: (current.events.at(-1)?.sequence ?? 0) + 1,
          kind: 'run.finished',
          title: 'Run cancelled',
          summary: 'Cancellation was recorded and the next FIFO turn may proceed.',
          state: 'warning',
          occurredAt: now,
        },
      ],
    }
    if (this.scenario === 'node_unavailable') this.scenario = 'ready'
    this.finishRun(updated, 'cancelled')
    this.publish({ tone: 'warning', message: 'Run cancelled. No new assistant message was fabricated.' })
    return success(updated)
  }

  retryRun = async (runId: string): Promise<AgentWorkspacePortResult<AgentRunView>> => {
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const current = this.canonical.runs.find((item) => item.runId === runId)
    if (!current) return failure('not_found', 'The run no longer exists.')
    const effectiveState = this.scenario === 'failed' && runId === 'run:korean:7'
      ? 'failed'
      : current.state
    if (effectiveState !== 'failed' && effectiveState !== 'cancelled') {
      return failure('conflict', 'Only a failed or cancelled run can be retried.')
    }
    if (current.attempt >= current.maxAttempts) return failure('conflict', 'This run has exhausted its retry budget.')
    const thread = this.canonical.threads.find((item) => item.threadId === current.threadId)
    if (!thread) return failure('not_found', 'The run thread no longer exists.')
    const now = Date.now()
    const state = thread.preferredNodeId ? 'waiting_for_node' : 'queued'
    const updated: AgentRunView = {
      ...current,
      state,
      attempt: current.attempt + 1,
      updatedAt: now,
      errorMessage: undefined,
    }
    if (this.scenario === 'failed') this.scenario = 'ready'
    this.canonical = {
      ...this.canonical,
      runs: this.canonical.runs.map((item) => item.runId === runId ? updated : item),
      threads: this.canonical.threads.map((item) => item.threadId === current.threadId ? {
        ...item,
        state,
        activeRunId: runId,
        sessionState: item.preferredNodeId ? 'waiting_for_node' : item.sessionState,
        updatedAt: now,
      } : item),
      messages: this.canonical.messages.map((item) => item.turnId === current.turnId ? { ...item, state, updatedAt: now } : item),
    }
    this.publish({
      tone: 'info',
      message: thread.preferredNodeId
        ? 'Retry queued for the same session-bound node.'
        : 'Retry queued. The runtime may route it to a compatible online node.',
    })
    return success(updated)
  }

  resetSession = async (threadId: string): Promise<AgentWorkspacePortResult<AgentThreadView>> => {
    const unavailable = this.writeUnavailable()
    if (unavailable) return unavailable
    const thread = this.canonical.threads.find((item) => item.threadId === threadId)
    if (!thread) return failure('not_found', 'The thread no longer exists.')
    const active = thread.activeRunId
      ? this.canonical.runs.find((item) => item.runId === thread.activeRunId)
      : undefined
    if (active && ACTIVE_STATES.has(active.state)) {
      return failure('conflict', 'Cancel or finish the active turn before resetting this session.')
    }
    const updated: AgentThreadView = {
      ...thread,
      preferredNodeId: undefined,
      activeRunId: undefined,
      sessionRevision: thread.sessionRevision + 1,
      sessionState: 'portable',
      updatedAt: Date.now(),
    }
    this.canonical = {
      ...this.canonical,
      threads: this.canonical.threads.map((item) => item.threadId === threadId ? updated : item),
    }
    this.publish({
      tone: 'warning',
      message: 'The node-local Pi session was detached explicitly. The durable thread history remains.',
    })
    return success(updated)
  }

  private writeUnavailable(): AgentWorkspacePortResult<never> | null {
    if (this.scenario === 'offline') {
      return failure('offline', 'Convex is offline. Your draft is still here; reconnect before sending.')
    }
    if (this.scenario === 'reconnecting') {
      return failure('offline', 'Convex is reconnecting. Wait for the subscription before changing durable state.')
    }
    if (this.scenario === 'conflict') {
      return failure('conflict', 'The durable record changed in another client. Refresh the current state and try again.')
    }
    return null
  }

  private finishRun(run: AgentRunView, state: 'cancelled' | 'failed'): void {
    this.canonical = {
      ...this.canonical,
      runs: this.canonical.runs.map((item) => item.runId === run.runId ? run : item),
      threads: this.canonical.threads.map((item) => item.threadId === run.threadId ? {
        ...item,
        state,
        activeRunId: undefined,
        updatedAt: run.updatedAt,
      } : item),
      messages: this.canonical.messages.map((item) => item.turnId === run.turnId ? {
        ...item,
        state,
        updatedAt: run.updatedAt,
      } : item),
    }
  }

  private publish(notice?: AgentWorkspaceSnapshot['operationNotice']): void {
    const next = structuredClone(this.canonical)
    next.previewScenario = this.scenario
    next.operationNotice = notice

    if (this.scenario === 'loading') {
      next.loadState = 'loading'
    } else if (this.scenario === 'load_error') {
      next.loadState = 'error'
      next.operationNotice = {
        tone: 'error',
        message: 'The workspace snapshot could not be loaded. Retry without discarding local drafts.',
      }
    } else if (this.scenario === 'empty') {
      next.loadState = 'empty'
      next.agents = []
      next.threads = []
      next.messages = []
      next.runs = []
    } else if (this.scenario === 'offline') {
      next.connection = 'offline'
      next.connectionDetail = 'Convex is unreachable. Durable writes are paused and drafts remain local to this view.'
    } else if (this.scenario === 'reconnecting') {
      next.connection = 'reconnecting'
      next.connectionDetail = 'The subscription is reconnecting. Existing data remains visible but may be stale.'
    } else if (this.scenario === 'node_unavailable') {
      next.nodes = next.nodes.map((node) => node.nodeId === 'node:atlas' ? { ...node, state: 'offline' } : node)
      next.threads = next.threads.map((thread) => thread.threadId === 'thread:korean' ? {
        ...thread,
        state: 'waiting_for_node',
        sessionState: 'waiting_for_node',
      } : thread)
      next.runs = next.runs.map((run) => run.runId === 'run:korean:7' ? {
        ...run,
        state: 'waiting_for_node',
        errorMessage: 'Atlas is offline. This session-bound turn will wait until it returns or the owner resets the session.',
      } : run)
    } else if (this.scenario === 'failed') {
      next.threads = next.threads.map((thread) => thread.threadId === 'thread:korean' ? {
        ...thread,
        state: 'failed',
      } : thread)
      next.runs = next.runs.map((run) => run.runId === 'run:korean:7' ? {
        ...run,
        state: 'failed',
        errorMessage: 'The provider stream ended before finalization. Durable effects remain checkpointed.',
      } : run)
    } else if (this.scenario === 'conflict') {
      next.operationNotice = {
        tone: 'error',
        message: 'Another client changed this record. Refresh before retrying; your draft is preserved.',
      }
    }

    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

export function createDemoAgentWorkspacePort(): DemoAgentWorkspacePort {
  return new DeterministicAgentWorkspacePort()
}
