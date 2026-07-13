export type ConnectionMode = 'connecting' | 'online' | 'reconnecting' | 'offline'
export type TaskStatus = 'open' | 'completed' | 'cancelled'
export type ReminderStatus = 'scheduled' | 'fired' | 'dismissed' | 'cancelled'
export type JobStatus = 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

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

export interface TodaySnapshot {
  tasks: TaskItem[]
  reminders: ReminderItem[]
  commands: CommandItem[]
  jobs: JobItem[]
  runs: RunItem[]
  nodes: NodeItem[]
}

export interface TransitionFailure {
  ok: false
  reason: 'not_found' | 'stale_revision' | 'invalid_state' | string
}

export type TransitionResult = { ok: true; revision: number } | TransitionFailure
