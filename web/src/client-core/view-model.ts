import type { CommandItem, JobItem, NodeItem, RunItem, TodaySnapshot } from './types'

export type HonestRunState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ActivityItem {
  command: CommandItem
  job?: JobItem
  run?: RunItem
  state: HonestRunState
  isFake: boolean
}

const ACTIVE_HEARTBEAT_WINDOW_MS = 60_000

export function isNodeAvailable(node: NodeItem, now = Date.now()): boolean {
  return node.status === 'online' && now - node.lastHeartbeatAt <= ACTIVE_HEARTBEAT_WINDOW_MS
}

export function deriveActivity(snapshot: TodaySnapshot): ActivityItem[] {
  return snapshot.commands
    .map((command) => {
      const job = snapshot.jobs.find((candidate) => candidate.commandId === command.commandId)
      const run = job
        ? snapshot.runs
            .filter((candidate) => candidate.jobId === job.jobId)
            .sort((a, b) => b.startedAt - a.startedAt)[0]
        : undefined
      let state: HonestRunState = 'queued'
      if (command.status === 'cancelled' || job?.status === 'cancelled' || run?.status === 'cancelled') state = 'cancelled'
      else if (command.status === 'failed' || job?.status === 'failed' || run?.status === 'failed') state = 'failed'
      else if (command.status === 'completed' || job?.status === 'succeeded' || run?.status === 'succeeded') state = 'completed'
      else if (job?.status === 'running' || job?.status === 'leased' || run?.status === 'running') state = 'running'
      return {
        command,
        job,
        run,
        state,
        isFake: Boolean(run?.nodeId.toLowerCase().includes('fake')),
      }
    })
    .sort((a, b) => b.command.createdAt - a.command.createdAt)
}

export function conflictMessage(reason: string): string {
  if (reason === 'stale_revision') return 'This changed somewhere else. Your edit was rolled back to the latest version.'
  if (reason === 'not_found') return 'This item no longer exists. The list has been refreshed.'
  if (reason === 'invalid_state') return 'That action is no longer available for this item.'
  return 'The change could not be saved. Your previous value has been restored.'
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now
  const absolute = Math.abs(delta)
  if (absolute < 60_000) return delta >= 0 ? 'in under a minute' : 'just now'
  if (absolute < 3_600_000) {
    const minutes = Math.round(absolute / 60_000)
    return delta >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  }
  if (absolute < 86_400_000) {
    const hours = Math.round(absolute / 3_600_000)
    return delta >= 0 ? `in ${hours}h` : `${hours}h ago`
  }
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(timestamp)
}
