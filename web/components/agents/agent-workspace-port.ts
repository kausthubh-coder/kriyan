export type AgentConnectionState = 'online' | 'reconnecting' | 'offline'

export type AgentNodeState = 'online' | 'stale' | 'offline' | 'revoked'

export type AgentTurnState =
  | 'queued'
  | 'waiting_for_node'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentWorkspaceLoadState = 'loading' | 'ready' | 'empty' | 'error'

export type AgentWorkspacePreviewScenario =
  | 'ready'
  | 'loading'
  | 'load_error'
  | 'empty'
  | 'offline'
  | 'reconnecting'
  | 'node_unavailable'
  | 'failed'
  | 'conflict'

export interface AgentRevisionView {
  revisionId: string
  ordinal: number
  displayName: string
  systemPromptSummary: string
  toolCapabilities: string[]
  createdAt: number
}

export interface AgentDefinitionView {
  agentId: string
  displayName: string
  currentRevisionId: string
  revision: number
  revisions: AgentRevisionView[]
}

export interface AgentNodeView {
  nodeId: string
  displayName: string
  state: AgentNodeState
  lastSeenAt: number
  capabilities: string[]
}

export interface AgentThreadView {
  threadId: string
  agentId: string
  agentRevisionId: string
  title: string
  latestMessage?: string
  latestMessageAt?: number
  state: AgentTurnState
  preferredNodeId?: string
  activeRunId?: string
  sessionRevision: number
  sessionState: 'portable' | 'active' | 'waiting_for_node' | 'reset_required'
  createdAt: number
  updatedAt: number
}

export interface AgentMessageView {
  messageId: string
  threadId: string
  turnId: string
  turnOrdinal: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  state: AgentTurnState
  content: string
  origin: 'owner' | 'agent' | 'system' | 'tool'
  agentRevisionId: string
  createdAt: number
  updatedAt: number
}

export interface AgentRunEventView {
  eventId: string
  runId: string
  sequence: number
  kind:
    | 'run.claimed'
    | 'run.started'
    | 'message.delta'
    | 'message.completed'
    | 'tool.started'
    | 'tool.finished'
    | 'effect.checkpointed'
    | 'knowledge.changed'
    | 'run.finished'
    | 'run.failed'
  title: string
  summary: string
  detail?: string
  state: 'info' | 'active' | 'success' | 'warning' | 'error'
  occurredAt: number
}

export interface AgentRunView {
  runId: string
  threadId: string
  turnId: string
  state: AgentTurnState
  attempt: number
  maxAttempts: number
  agentRevisionId: string
  nodeId?: string
  sessionId?: string
  sessionRevision: number
  startedAt?: number
  updatedAt: number
  errorMessage?: string
  events: AgentRunEventView[]
}

export interface AgentWorkspaceSnapshot {
  mode: 'demo' | 'live'
  loadState: AgentWorkspaceLoadState
  connection: AgentConnectionState
  connectionDetail: string
  previewScenario?: AgentWorkspacePreviewScenario
  agents: AgentDefinitionView[]
  threads: AgentThreadView[]
  messages: AgentMessageView[]
  runs: AgentRunView[]
  nodes: AgentNodeView[]
  coverageNotice?: string
  operationNotice?: {
    tone: 'info' | 'success' | 'warning' | 'error'
    message: string
  }
}

export type AgentWorkspacePortErrorCode =
  | 'offline'
  | 'conflict'
  | 'invalid_input'
  | 'not_found'
  | 'node_unavailable'

export type AgentWorkspacePortResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: AgentWorkspacePortErrorCode; message: string }

export interface CreateAgentThreadInput {
  title: string
  agentId: string
  preferredNodeId?: string
}

export interface CreateAgentInput {
  displayName: string
  systemPromptSummary: string
  toolCapabilities: string[]
}

export interface ReviseAgentInput {
  agentId: string
  displayName: string
  systemPromptSummary: string
  toolCapabilities: string[]
}

export interface SubmitAgentMessageInput {
  threadId: string
  content: string
  clientRequestId: string
}

/**
 * Framework-neutral boundary between the agent workspace and the accepted
 * reactive state plane. A production adapter owns Convex subscriptions and
 * mutations; presentation code owns no generated hooks or node transport.
 */
export interface AgentWorkspacePort {
  getSnapshot(): AgentWorkspaceSnapshot
  subscribe(listener: () => void): () => void
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

export interface DemoAgentWorkspacePort extends AgentWorkspacePort {
  setPreviewScenario(scenario: AgentWorkspacePreviewScenario): void
}
