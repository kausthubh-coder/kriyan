import type {
  ActivityItem,
  ActivityProjectionItem,
  NodeItem,
  TransitionReason,
} from './types'

export const HEARTBEAT_FRESHNESS_MS = 60_000
const MIN_TIMER_MS = 50

export function nextClockDelay(now: number, heartbeatTimestamps: readonly number[]): number {
  const nextMinute = now + (60_000 - (now % 60_000))
  const heartbeatBoundaries = heartbeatTimestamps
    .map((timestamp) => timestamp + HEARTBEAT_FRESHNESS_MS + 1)
    .filter((timestamp) => timestamp > now)
  const next = Math.min(nextMinute, ...heartbeatBoundaries)
  return Math.max(MIN_TIMER_MS, next - now)
}

export function isNodeAvailable(node: NodeItem, now = Date.now()): boolean {
  return node.status === 'online' && now - node.lastHeartbeatAt <= HEARTBEAT_FRESHNESS_MS
}

export function deriveActivityItem(item: ActivityProjectionItem): ActivityItem {
  const { command, job, run } = item
  let state: ActivityItem['state'] = 'queued'
  if (command.status === 'cancelled' || job?.status === 'cancelled') state = 'cancelled'
  else if (command.status === 'failed' || job?.status === 'failed') state = 'failed'
  else if (command.status === 'completed' || job?.status === 'succeeded') state = 'completed'
  else if (job?.status === 'leased' || job?.status === 'running') state = 'running'

  return {
    command,
    job,
    run,
    state,
    isFake: Boolean(run?.nodeId.toLowerCase().includes('fake')),
  }
}

export function deriveActivity(items: readonly ActivityProjectionItem[]): ActivityItem[] {
  return items
    .map(deriveActivityItem)
    .sort((a, b) => b.command.createdAt - a.command.createdAt
      || b.command.commandId.localeCompare(a.command.commandId))
}

export function conflictMessage(reason: TransitionReason): string {
  if (reason === 'stale_revision') return 'This changed somewhere else. Your edit was rolled back to the latest version.'
  if (reason === 'not_found') return 'This item no longer exists. The list has been refreshed.'
  if (reason === 'invalid_state') return 'That action is no longer available for this item.'
  if (reason === 'attempts_exhausted') return 'Retry is unavailable because this job used all of its attempts.'
  if (reason === 'already_terminal') return 'This command already finished and can no longer be changed.'
  return 'Kriyan could not reach the installation. Your previous value has been restored.'
}

export function retryEligibility(item: ActivityItem): { eligible: boolean; reason: string } {
  if (item.state !== 'failed' || !item.job) return { eligible: false, reason: 'Only failed jobs can be retried.' }
  if (item.job.attempt >= item.job.maxAttempts) {
    return { eligible: false, reason: `All ${item.job.maxAttempts} attempts have been used.` }
  }
  return { eligible: true, reason: `${item.job.maxAttempts - item.job.attempt} attempts remaining.` }
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
