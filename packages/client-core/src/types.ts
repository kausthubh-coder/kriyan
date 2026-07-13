export type ConnectionMode = 'connecting' | 'online' | 'reconnecting' | 'offline'
export type ConnectionRecovery = 'initial' | 'confirmed' | 'awaiting-ready' | 'awaiting-subscription' | 'unconfirmed'
export type TaskStatus = 'open' | 'completed' | 'cancelled'
export type ReminderStatus = 'scheduled' | 'fired' | 'dismissed' | 'cancelled'
export type JobStatus = 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'
export type HonestRunState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TransitionReason =
  | 'not_found'
  | 'stale_revision'
  | 'invalid_state'
  | 'attempts_exhausted'
  | 'already_terminal'
  | 'transport_error'

export interface InstallationItem {
  installationId: string
  timezone: string
  protocolVersion: string
  createdAt: number
  updatedAt: number
}

export interface TaskItem {
  taskId: string
  title: string
  status: TaskStatus
  dueAt?: number
  revision: number
  createdAt: number
  updatedAt: number
  optimistic?: boolean
}

export interface ReminderItem {
  reminderId: string
  message: string
  remindAt: number
  timezone: string
  status: ReminderStatus
  revision: number
  createdAt: number
  updatedAt: number
  optimistic?: boolean
}

export interface CommandItem {
  commandId: string
  input: string
  status: 'accepted' | 'completed' | 'failed' | 'cancelled'
  revision: number
  createdAt: number
  updatedAt: number
}

export interface JobItem {
  jobId: string
  commandId: string
  status: JobStatus
  attempt: number
  maxAttempts: number
  lastError?: string
  revision: number
  createdAt: number
  updatedAt: number
}

export interface RunItem {
  runId: string
  jobId: string
  attempt: number
  nodeId: string
  status: RunStatus
  revision: number
  startedAt: number
  finishedAt?: number
  error?: string
}

export interface RunEventItem {
  eventId: string
  runId: string
  sequence: number
  type: 'status' | 'message' | 'tool' | 'error'
  data: string
  createdAt: number
}

export interface NodeItem {
  nodeId: string
  displayName: string
  capabilities: string[]
  status: 'online' | 'offline' | 'revoked'
  lastHeartbeatAt: number
  revision: number
}

export interface ActivityItem {
  command: CommandItem
  job?: JobItem
  run?: RunItem
  state: HonestRunState
  isFake: boolean
}

export interface ActivityProjectionItem {
  command: CommandItem
  job?: JobItem
  run?: RunItem
}

export interface PageState {
  canLoadMore: boolean
  loadingMore: boolean
  loadedCount: number
}

export type TransitionResult =
  | { ok: true; revision: number }
  | { ok: false; reason: TransitionReason }

export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: TransitionReason; message: string }
