'use client'

import { createClientId, nextClockDelay } from '@kriyan/client-core'
import type { FunctionReturnType } from 'convex/server'
import {
  useConvexConnectionState,
  useMutation,
  useQuery,
} from 'convex/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { api } from '@convex/_generated/api'
import { useConvexClientControls } from '@/lib/convex'
import type { KriyanWebConfiguration } from '@/lib/runtime-settings'

import { AgentWorkspace } from './agent-workspace'
import type {
  AgentDefinitionView,
  AgentMessageView,
  AgentNodeView,
  AgentRunEventView,
  AgentRunView,
  AgentThreadView,
  AgentTurnState,
  AgentWorkspacePort,
  AgentWorkspacePortErrorCode,
  AgentWorkspacePortResult,
  AgentWorkspaceSnapshot,
  CreateAgentInput,
  CreateAgentThreadInput,
  ReviseAgentInput,
  SubmitAgentMessageInput,
} from './agent-workspace-port'

type ClientSnapshotWire = FunctionReturnType<typeof api.read.clientSnapshot>
type DefinitionRows = FunctionReturnType<typeof api.agents.listDefinitions>
type RecentRunEvents = FunctionReturnType<typeof api.read.agentRunEvents>
type ActivityWire = ClientSnapshotWire['nodes']['activity'][number]
type ThreadWire = ClientSnapshotWire['agents']['threads'][number]

const ACTIVE_STATES = new Set<AgentTurnState>(['queued', 'waiting_for_node', 'running'])
const NODE_STALE_AFTER_MS = 60_000

const LOADING_SNAPSHOT: AgentWorkspaceSnapshot = {
  mode: 'live',
  loadState: 'loading',
  connection: 'offline',
  connectionDetail: 'Connecting to the configured Convex deployment…',
  agents: [],
  threads: [],
  messages: [],
  runs: [],
  nodes: [],
}

function success<T>(value: T): AgentWorkspacePortResult<T> {
  return { ok: true, value }
}

function failure(
  code: AgentWorkspacePortErrorCode,
  message: string,
): AgentWorkspacePortResult<never> {
  return { ok: false, code, message }
}

function reasonFailure(reason: string): AgentWorkspacePortResult<never> {
  if (reason === 'not_found') return failure('not_found', 'That record no longer exists in this installation.')
  if (reason === 'stale_revision') return failure('conflict', 'This changed in another client. Review the latest state and try again.')
  if (reason === 'inactive_node' || reason === 'stale_heartbeat') return failure('node_unavailable', 'The selected node is not available.')
  if (reason === 'attempts_exhausted') return failure('conflict', 'This run has exhausted its retry budget.')
  return failure('conflict', 'The current state no longer allows that operation.')
}

function exceptionFailure(error: unknown, online: boolean): AgentWorkspacePortResult<never> {
  const message = error instanceof Error ? error.message : 'The operation failed unexpectedly.'
  return online
    ? failure('conflict', message)
    : failure('offline', `Convex is offline. Your draft is preserved. ${message}`)
}

function turnState(value: string): AgentTurnState {
  if (value === 'active') return 'running'
  if (value === 'queued' || value === 'waiting_for_node' || value === 'completed' || value === 'failed' || value === 'cancelled') return value
  return 'failed'
}

function runState(activity: ActivityWire): AgentTurnState {
  if (activity.command.status === 'cancelled' || activity.job?.status === 'cancelled') return 'cancelled'
  if (activity.command.status === 'failed' || activity.job?.status === 'failed') return 'failed'
  if (activity.command.status === 'completed' || activity.job?.status === 'succeeded') return 'completed'
  if (activity.job?.status === 'running' || activity.job?.status === 'leased') return 'running'
  return activity.job?.preferredNodeId ? 'waiting_for_node' : 'queued'
}

function currentRun(activity: ActivityWire): ActivityWire['run'] {
  if (activity.job?.status === 'queued' && activity.run?.status !== 'running') return undefined
  return activity.run
}

function eventKind(event: RecentRunEvents['items'][number]): AgentRunEventView['kind'] {
  if (event.type === 'status') return 'run.started'
  if (event.type === 'message') return 'message.delta'
  if (event.type === 'error') return 'run.failed'
  if (event.type === 'tool') {
    try {
      const value: unknown = JSON.parse(event.data)
      if (value && typeof value === 'object' && (value as Record<string, unknown>).status === 'finished') return 'tool.finished'
    } catch {
      // The public event data may be a plain safe string.
    }
    return 'tool.started'
  }
  return event.type
}

function eventSummary(data: string): string {
  try {
    const value: unknown = JSON.parse(data)
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const parts = ['name', 'tool', 'status', 'message', 'text']
        .map((key) => record[key])
        .filter((item): item is string => typeof item === 'string')
      if (parts.length > 0) return parts.join(' · ')
    }
  } catch {
    // The public event data may be a plain safe string.
  }
  return data || 'Runtime update received.'
}

function mapEvent(event: RecentRunEvents['items'][number]): AgentRunEventView {
  const kind = eventKind(event)
  const title: Record<AgentRunEventView['kind'], string> = {
    'run.claimed': 'Run claimed',
    'run.started': 'Run started',
    'message.delta': 'Agent response',
    'message.completed': 'Response completed',
    'tool.started': 'Tool started',
    'tool.finished': 'Tool finished',
    'effect.checkpointed': 'Effect checkpointed',
    'knowledge.changed': 'Knowledge changed',
    'run.finished': 'Run finished',
    'run.failed': 'Run failed',
  }
  const state: AgentRunEventView['state'] = kind === 'run.failed'
    ? 'error'
    : kind === 'run.started' || kind === 'message.delta' || kind === 'tool.started' || kind === 'knowledge.changed'
      ? 'active'
      : 'success'
  return {
    eventId: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    kind,
    title: title[kind],
    summary: eventSummary(event.data),
    state,
    occurredAt: event.createdAt,
  }
}

function mapMessage(message: ClientSnapshotWire['agents']['messages'][number]): AgentMessageView {
  const origin: AgentMessageView['origin'] = message.role === 'user'
    ? 'owner'
    : message.role === 'assistant'
      ? 'agent'
      : message.role
  return {
    messageId: message.messageId,
    threadId: message.threadId,
    turnId: message.turnId,
    turnOrdinal: message.turnOrdinal,
    role: message.role,
    state: turnState(message.state),
    content: message.content,
    origin,
    agentRevisionId: message.agentRevisionId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

function mapNode(node: ClientSnapshotWire['nodes']['items'][number], now: number): AgentNodeView {
  const state: AgentNodeView['state'] = node.status === 'revoked'
    ? 'revoked'
    : node.status === 'offline'
      ? 'offline'
      : now - node.lastHeartbeatAt > NODE_STALE_AFTER_MS
        ? 'stale'
        : 'online'
  return {
    nodeId: node.nodeId,
    displayName: node.displayName,
    state,
    lastSeenAt: node.lastHeartbeatAt,
    capabilities: node.capabilities,
  }
}

function syntheticRunId(activity: ActivityWire): string {
  return currentRun(activity)?.runId ?? activity.job?.jobId ?? `command:${activity.command.commandId}`
}

function mapRun(
  activity: ActivityWire,
  eventsByRun: ReadonlyMap<string, AgentRunEventView[]>,
  threads: readonly ThreadWire[],
): AgentRunView | null {
  const job = activity.job
  if (!job?.threadId || !job.turnId || !job.agentRevisionId) return null
  const run = currentRun(activity)
  const thread = threads.find((item) => item.threadId === job.threadId)
  const runId = syntheticRunId(activity)
  return {
    runId,
    threadId: job.threadId,
    turnId: job.turnId,
    state: runState(activity),
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    agentRevisionId: job.agentRevisionId,
    nodeId: run?.nodeId ?? job.leaseOwnerNodeId ?? job.preferredNodeId,
    sessionId: job.sessionCheckpoint,
    sessionRevision: job.sessionRevision ?? thread?.sessionRevision ?? 0,
    startedAt: run?.startedAt,
    updatedAt: run?.finishedAt ?? job.updatedAt,
    errorMessage: run?.error ?? job.lastError,
    events: run ? eventsByRun.get(run.runId) ?? [] : [],
  }
}

function mapDefinition(row: DefinitionRows[number]): AgentDefinitionView {
  return {
    agentId: row.agent.agentId,
    displayName: row.agent.displayName,
    currentRevisionId: row.agent.currentRevisionId,
    revision: row.agent.revision,
    revisions: row.revisions.map((revision) => ({
      revisionId: revision.agentRevisionId,
      ordinal: revision.ordinal,
      displayName: revision.displayName,
      systemPromptSummary: revision.systemPrompt,
      toolCapabilities: revision.toolCapabilities,
      createdAt: revision.createdAt,
    })),
  }
}

function mapThread(
  thread: ThreadWire,
  messages: readonly AgentMessageView[],
  runs: readonly AgentRunView[],
  nodes: readonly AgentNodeView[],
): AgentThreadView {
  const threadMessages = messages.filter((message) => message.threadId === thread.threadId)
  const latestMessage = [...threadMessages].sort((left, right) => right.updatedAt - left.updatedAt)[0]
  const threadRuns = runs.filter((run) => run.threadId === thread.threadId).sort((left, right) => right.updatedAt - left.updatedAt)
  const activeRun = threadRuns.find((run) => ACTIVE_STATES.has(run.state))
  const latestRun = activeRun ?? threadRuns[0]
  const node = nodes.find((item) => item.nodeId === thread.preferredNodeId)
  const sessionState: AgentThreadView['sessionState'] = thread.piSessionRef && node?.state === 'revoked'
    ? 'reset_required'
    : thread.piSessionRef && node?.state !== 'offline' && node?.state !== 'stale'
      ? 'active'
      : thread.preferredNodeId && latestRun?.state === 'waiting_for_node'
        ? 'waiting_for_node'
        : 'portable'
  return {
    threadId: thread.threadId,
    agentId: thread.agentId,
    agentRevisionId: thread.agentRevisionId,
    title: thread.title ?? 'Untitled conversation',
    latestMessage: latestMessage?.content,
    latestMessageAt: latestMessage?.updatedAt,
    state: latestRun?.state ?? latestMessage?.state ?? 'completed',
    preferredNodeId: thread.preferredNodeId,
    activeRunId: activeRun?.runId,
    sessionRevision: thread.sessionRevision,
    sessionState,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  }
}

interface MappedWorkspace {
  snapshot: AgentWorkspaceSnapshot
  activityByRunId: ReadonlyMap<string, ActivityWire>
  threadsById: ReadonlyMap<string, ThreadWire>
  definitionsById: ReadonlyMap<string, DefinitionRows[number]>
}

function mapWorkspace(
  connection: AgentWorkspaceSnapshot['connection'],
  installation: FunctionReturnType<typeof api.installations.get> | undefined,
  wire: ClientSnapshotWire | undefined,
  definitions: DefinitionRows | undefined,
  recentEvents: RecentRunEvents | undefined,
  requestedRunIds: readonly string[],
  now: number,
): MappedWorkspace {
  const connectionDetail = connection === 'online'
    ? 'Reactive Convex subscriptions are connected.'
    : connection === 'reconnecting'
      ? 'Convex is reconnecting; confirmed state remains visible.'
      : 'Convex is offline. Drafts stay local until the connection returns.'
  const emptyMaps = {
    activityByRunId: new Map<string, ActivityWire>(),
    threadsById: new Map<string, ThreadWire>(),
    definitionsById: new Map<string, DefinitionRows[number]>(),
  }
  if (installation === null) {
    return {
      snapshot: {
        ...LOADING_SNAPSHOT,
        loadState: 'error',
        connection,
        connectionDetail,
        operationNotice: { tone: 'error', message: 'The configured installation does not exist in this Convex deployment.' },
      },
      ...emptyMaps,
    }
  }
  if (installation === undefined || wire === undefined || definitions === undefined) {
    return {
      snapshot: { ...LOADING_SNAPSHOT, connection, connectionDetail },
      ...emptyMaps,
    }
  }

  const agents = definitions.map(mapDefinition)
  const messages = wire.agents.messages.map(mapMessage)
    .sort((left, right) => left.turnOrdinal - right.turnOrdinal || left.createdAt - right.createdAt)
  const nodes = wire.nodes.items.map((node) => mapNode(node, now))
  const eventsByRun = new Map<string, AgentRunEventView[]>()
  for (const event of (recentEvents?.items ?? []).map(mapEvent)) {
    eventsByRun.set(event.runId, [...(eventsByRun.get(event.runId) ?? []), event])
  }
  const runs = wire.nodes.activity
    .map((activity) => mapRun(activity, eventsByRun, wire.agents.threads))
    .filter((run): run is AgentRunView => run !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const threads = wire.agents.threads
    .filter((thread) => thread.deletedAt === undefined)
    .map((thread) => mapThread(thread, messages, runs, nodes))
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const activityByRunId = new Map<string, ActivityWire>()
  for (const activity of wire.nodes.activity) activityByRunId.set(syntheticRunId(activity), activity)
  const requestedRunIdSet = new Set(recentEvents?.queriedRunIds ?? requestedRunIds)
  const visibleRunIds = wire.nodes.activity.flatMap((activity) => {
    const run = currentRun(activity)
    return run ? [run.runId] : []
  })
  const queriedVisibleRunCount = visibleRunIds.filter((runId) => requestedRunIdSet.has(runId)).length
  const unqueriedRunCount = visibleRunIds.length - queriedVisibleRunCount
  const coverageNotices = [
    wire.windows.threads.truncated
      ? `Threads are limited to ${wire.windows.threads.returned} records in identifier-index order; this window is not guaranteed to contain the most recently updated threads.`
      : undefined,
    wire.windows.messages.truncated
      ? `Messages are limited to ${wire.windows.messages.returned} records in identifier-index order; this window is not guaranteed to contain the most recently updated messages.`
      : undefined,
    wire.windows.activity.truncated
      ? `Runs are derived from the newest ${wire.windows.activity.returned} commands by creation time; older command activity is not loaded.`
      : undefined,
    wire.windows.nodes.truncated
      ? `Nodes are limited to ${wire.windows.nodes.returned} records in identifier-index order.`
      : undefined,
    unqueriedRunCount > 0
      ? `Run-event subscriptions cover ${queriedVisibleRunCount} of ${visibleRunIds.length} visible run histories (maximum ${recentEvents?.runIdLimit ?? 20}), starting from the newest command activity. For the other ${unqueriedRunCount}, an empty timeline means history was not loaded—not that the run had no events.`
      : undefined,
    recentEvents && recentEvents.truncatedRunIds.length > 0
      ? `${recentEvents.truncatedRunIds.length} subscribed run ${recentEvents.truncatedRunIds.length === 1 ? 'timeline is' : 'timelines are'} limited to the newest 50 public events.`
      : undefined,
  ].filter((item): item is string => item !== undefined)
  return {
    snapshot: {
      mode: 'live',
      loadState: agents.length === 0 ? 'empty' : 'ready',
      connection,
      connectionDetail,
      agents,
      threads,
      messages,
      runs,
      nodes,
      coverageNotice: coverageNotices.length > 0
        ? coverageNotices.join(' ')
        : undefined,
    },
    activityByRunId,
    threadsById: new Map(wire.agents.threads.map((thread) => [thread.threadId, thread])),
    definitionsById: new Map(definitions.map((row) => [row.agent.agentId, row])),
  }
}

interface LiveOperations {
  refresh(): Promise<AgentWorkspacePortResult>
  createAgent(input: CreateAgentInput): Promise<AgentWorkspacePortResult<AgentDefinitionView>>
  createThread(input: CreateAgentThreadInput): Promise<AgentWorkspacePortResult<AgentThreadView>>
  renameThread(threadId: string, title: string): Promise<AgentWorkspacePortResult<AgentThreadView>>
  reviseAgent(input: ReviseAgentInput): Promise<AgentWorkspacePortResult<AgentDefinitionView>>
  submitMessage(input: SubmitAgentMessageInput): Promise<AgentWorkspacePortResult<AgentRunView>>
  cancelRun(runId: string): Promise<AgentWorkspacePortResult<AgentRunView>>
  retryRun(runId: string): Promise<AgentWorkspacePortResult<AgentRunView>>
  resetSession(threadId: string): Promise<AgentWorkspacePortResult<AgentThreadView>>
}

const UNAVAILABLE_OPERATIONS: LiveOperations = {
  refresh: async () => failure('offline', 'The live adapter is still loading.'),
  createAgent: async () => failure('offline', 'The live adapter is still loading.'),
  createThread: async () => failure('offline', 'The live adapter is still loading.'),
  renameThread: async () => failure('offline', 'The live adapter is still loading.'),
  reviseAgent: async () => failure('offline', 'The live adapter is still loading.'),
  submitMessage: async () => failure('offline', 'The live adapter is still loading.'),
  cancelRun: async () => failure('offline', 'The live adapter is still loading.'),
  retryRun: async () => failure('offline', 'The live adapter is still loading.'),
  resetSession: async () => failure('offline', 'The live adapter is still loading.'),
}

class ReactiveAgentWorkspacePort implements AgentWorkspacePort {
  private snapshot = LOADING_SNAPSHOT
  private operations = UNAVAILABLE_OPERATIONS
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): AgentWorkspaceSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  update(snapshot: AgentWorkspaceSnapshot, operations: LiveOperations): void {
    this.snapshot = snapshot
    this.operations = operations
    for (const listener of [...this.listeners]) listener()
  }
  refresh = (): Promise<AgentWorkspacePortResult> => this.operations.refresh()
  createAgent = (input: CreateAgentInput): Promise<AgentWorkspacePortResult<AgentDefinitionView>> => this.operations.createAgent(input)
  createThread = (input: CreateAgentThreadInput): Promise<AgentWorkspacePortResult<AgentThreadView>> => this.operations.createThread(input)
  renameThread = (threadId: string, title: string): Promise<AgentWorkspacePortResult<AgentThreadView>> => this.operations.renameThread(threadId, title)
  reviseAgent = (input: ReviseAgentInput): Promise<AgentWorkspacePortResult<AgentDefinitionView>> => this.operations.reviseAgent(input)
  submitMessage = (input: SubmitAgentMessageInput): Promise<AgentWorkspacePortResult<AgentRunView>> => this.operations.submitMessage(input)
  cancelRun = (runId: string): Promise<AgentWorkspacePortResult<AgentRunView>> => this.operations.cancelRun(runId)
  retryRun = (runId: string): Promise<AgentWorkspacePortResult<AgentRunView>> => this.operations.retryRun(runId)
  resetSession = (threadId: string): Promise<AgentWorkspacePortResult<AgentThreadView>> => this.operations.resetSession(threadId)
}

function useLiveAgentWorkspacePort(configuration: KriyanWebConfiguration): AgentWorkspacePort {
  const { installationId } = configuration
  const controls = useConvexClientControls()
  const connectionState = useConvexConnectionState()
  const connection: AgentWorkspaceSnapshot['connection'] = connectionState.isWebSocketConnected
    ? 'online'
    : connectionState.hasEverConnected
      ? 'reconnecting'
      : 'offline'
  const installation = useQuery(api.installations.get, { installationId })
  const queryArgs = installation ? { installationId } : 'skip'
  const wire = useQuery(api.read.clientSnapshot, queryArgs)
  const definitions = useQuery(api.agents.listDefinitions, queryArgs)
  const recentRunIds = useMemo(() => wire?.nodes.activity
    .flatMap((activity) => {
      const run = currentRun(activity)
      return run ? [run.runId] : []
    })
    .slice(0, 20) ?? [], [wire])
  const recentEvents = useQuery(
    api.read.agentRunEvents,
    installation && wire ? { installationId, runIds: recentRunIds } : 'skip',
  )
  const [clock, setClock] = useState(() => Date.now())
  const heartbeatTimestamps = useMemo(
    () => wire?.nodes.items.map((node) => node.lastHeartbeatAt) ?? [],
    [wire],
  )
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setClock(Date.now()),
      nextClockDelay(clock, heartbeatTimestamps),
    )
    return () => window.clearTimeout(timeout)
  }, [clock, heartbeatTimestamps])

  const createAgentMutation = useMutation(api.agents.create)
  const createThreadMutation = useMutation(api.agents.createThread)
  const renameThreadMutation = useMutation(api.agents.renameThread)
  const reviseAgentMutation = useMutation(api.agents.revise)
  const submitMessageMutation = useMutation(api.agents.submitMessage)
  const cancelMutation = useMutation(api.commands.cancel)
  const retryMutation = useMutation(api.commands.retry)
  const resetSessionMutation = useMutation(api.agents.resetSession)

  const mapped = useMemo(
    () => mapWorkspace(connection, installation, wire, definitions, recentEvents, recentRunIds, clock),
    [clock, connection, definitions, installation, recentEvents, recentRunIds, wire],
  )
  const online = connection === 'online'
  const operations = useMemo<LiveOperations>(() => ({
    refresh: async () => {
      controls.recreate()
      return success(undefined)
    },
    createAgent: async (input) => {
      const displayName = input.displayName.trim()
      const systemPrompt = input.systemPromptSummary.trim()
      if (!displayName || !systemPrompt) return failure('invalid_input', 'Name and instructions are required.')
      const agentId = createClientId('agent')
      const agentRevisionId = createClientId('agent-revision')
      const toolCapabilities = [...new Set(input.toolCapabilities.map((item) => item.trim()).filter(Boolean))]
      try {
        const result = await createAgentMutation({
          installationId,
          agentId,
          agentRevisionId,
          displayName,
          systemPrompt,
          toolCapabilities,
        })
        return success({
          agentId: result.agent.agentId,
          displayName: result.agent.displayName,
          currentRevisionId: result.agent.currentRevisionId,
          revision: result.agent.revision,
          revisions: [{
            revisionId: result.revision.agentRevisionId,
            ordinal: result.revision.ordinal,
            displayName: result.revision.displayName,
            systemPromptSummary: result.revision.systemPrompt,
            toolCapabilities: result.revision.toolCapabilities,
            createdAt: result.revision.createdAt,
          }],
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    createThread: async (input) => {
      const title = input.title.trim()
      if (!title) return failure('invalid_input', 'Enter a thread title.')
      try {
        const result = await createThreadMutation({
          installationId,
          threadId: createClientId('thread'),
          agentId: input.agentId,
          title,
          preferredNodeId: input.preferredNodeId,
        })
        const thread = result.thread
        return success({
          threadId: thread.threadId,
          agentId: thread.agentId,
          agentRevisionId: thread.agentRevisionId,
          title: thread.title ?? 'Untitled conversation',
          state: 'completed',
          preferredNodeId: thread.preferredNodeId,
          sessionRevision: thread.sessionRevision,
          sessionState: 'portable',
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    renameThread: async (threadId, titleValue) => {
      const title = titleValue.trim()
      if (!title) return failure('invalid_input', 'Enter a thread title.')
      const current = mapped.snapshot.threads.find((thread) => thread.threadId === threadId)
      if (!current) return failure('not_found', 'That thread no longer exists.')
      try {
        const result = await renameThreadMutation({ installationId, threadId, title })
        if (!result.ok) return reasonFailure(result.reason)
        return success({ ...current, title: result.thread.title ?? title, updatedAt: result.thread.updatedAt })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    reviseAgent: async (input) => {
      const current = mapped.definitionsById.get(input.agentId)
      if (!current) return failure('not_found', 'That agent definition no longer exists.')
      const displayName = input.displayName.trim()
      const systemPrompt = input.systemPromptSummary.trim()
      if (!displayName || !systemPrompt) return failure('invalid_input', 'Name and instructions are required.')
      const agentRevisionId = createClientId('agent-revision')
      try {
        const result = await reviseAgentMutation({
          installationId,
          agentId: input.agentId,
          agentRevisionId,
          expectedRevision: current.agent.revision,
          displayName,
          systemPrompt,
          toolCapabilities: input.toolCapabilities,
        })
        if (!result.ok) return reasonFailure(result.reason)
        const createdAt = Date.now()
        return success({
          agentId: input.agentId,
          displayName,
          currentRevisionId: agentRevisionId,
          revision: result.revision,
          revisions: [{
            revisionId: agentRevisionId,
            ordinal: result.revision,
            displayName,
            systemPromptSummary: systemPrompt,
            toolCapabilities: input.toolCapabilities,
            createdAt,
          }, ...mapDefinition(current).revisions],
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    submitMessage: async (input) => {
      const content = input.content.trim()
      if (!content) return failure('invalid_input', 'Enter a message.')
      if (input.clientRequestId.length > 128) return failure('invalid_input', 'The client request identifier is too long.')
      const thread = mapped.threadsById.get(input.threadId)
      if (!thread) return failure('not_found', 'That thread no longer exists.')
      try {
        const result = await submitMessageMutation({
          installationId,
          threadId: input.threadId,
          commandId: createClientId('command'),
          messageId: createClientId('message'),
          idempotencyKey: input.clientRequestId,
          content,
          maxAttempts: 3,
        })
        return success({
          runId: result.job.jobId,
          threadId: input.threadId,
          turnId: result.job.turnId ?? result.message.turnId,
          state: result.job.preferredNodeId ? 'waiting_for_node' : 'queued',
          attempt: result.job.attempt,
          maxAttempts: result.job.maxAttempts,
          agentRevisionId: result.job.agentRevisionId ?? thread.agentRevisionId,
          nodeId: result.job.preferredNodeId,
          sessionId: result.job.sessionCheckpoint,
          sessionRevision: result.job.sessionRevision ?? thread.sessionRevision,
          updatedAt: result.job.updatedAt,
          events: [],
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    cancelRun: async (runId) => {
      const activity = mapped.activityByRunId.get(runId)
      const current = mapped.snapshot.runs.find((run) => run.runId === runId)
      if (!activity || !current) return failure('not_found', 'That run is no longer in the reactive activity window.')
      try {
        const result = await cancelMutation({
          installationId,
          commandId: activity.command.commandId,
          expectedRevision: activity.command.revision,
        })
        if (!result.ok) return reasonFailure(result.reason)
        return success({ ...current, state: 'cancelled', updatedAt: Date.now() })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    retryRun: async (runId) => {
      const activity = mapped.activityByRunId.get(runId)
      const current = mapped.snapshot.runs.find((run) => run.runId === runId)
      if (!activity?.job || !current) return failure('not_found', 'That run is no longer in the reactive activity window.')
      try {
        const result = await retryMutation({
          installationId,
          commandId: activity.command.commandId,
          expectedCommandRevision: activity.command.revision,
          expectedJobRevision: activity.job.revision,
        })
        if (!result.ok) return reasonFailure(result.reason)
        return success({
          ...current,
          state: activity.job.preferredNodeId ? 'waiting_for_node' : 'queued',
          errorMessage: undefined,
          updatedAt: Date.now(),
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
    resetSession: async (threadId) => {
      const thread = mapped.threadsById.get(threadId)
      const current = mapped.snapshot.threads.find((item) => item.threadId === threadId)
      if (!thread || !current) return failure('not_found', 'That thread no longer exists.')
      try {
        const result = await resetSessionMutation({
          installationId,
          threadId,
          expectedRevision: thread.sessionRevision,
        })
        if (!result.ok) return reasonFailure(result.reason)
        return success({
          ...current,
          preferredNodeId: undefined,
          sessionRevision: result.revision,
          sessionState: 'portable',
        })
      } catch (error) {
        return exceptionFailure(error, online)
      }
    },
  }), [
    cancelMutation,
    controls,
    createAgentMutation,
    createThreadMutation,
    installationId,
    mapped,
    online,
    renameThreadMutation,
    resetSessionMutation,
    retryMutation,
    reviseAgentMutation,
    submitMessageMutation,
  ])

  const [port] = useState(() => new ReactiveAgentWorkspacePort())
  useEffect(() => port.update(mapped.snapshot, operations), [mapped.snapshot, operations, port])
  return port
}

export function LiveAgentWorkspace({ configuration }: { configuration: KriyanWebConfiguration }): ReactNode {
  const port = useLiveAgentWorkspacePort(configuration)
  return <AgentWorkspace port={port} />
}
