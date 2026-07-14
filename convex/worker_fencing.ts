import { REMINDER_CAPABILITY } from '@kriyan/contracts'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { NODE_HEARTBEAT_TIMEOUT_MS } from './lib'

type ReadCtx = MutationCtx | QueryCtx

export async function requireLeaseFencedJob(
  ctx: ReadCtx,
  args: {
    installationId: string
    jobId: string
    nodeId: string
    expectedJobRevision: number
    expectedLeaseToken: string
  },
): Promise<Doc<'jobs'>> {
  const job = await requireActiveLeasedJob(ctx, args)
  if (job.revision !== args.expectedJobRevision) throw new Error('stale_revision')
  return job
}

export async function requireActiveLeasedJob(
  ctx: ReadCtx,
  args: {
    installationId: string
    jobId: string
    nodeId: string
    expectedLeaseToken: string
  },
): Promise<Doc<'jobs'>> {
  const job = await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
    q.eq('installationId', args.installationId).eq('jobId', args.jobId),
  ).unique()
  if (job === null) throw new Error('not_found')
  if (job.status !== 'leased' && job.status !== 'running') throw new Error('invalid_state')
  if (job.leaseOwnerNodeId !== args.nodeId) throw new Error('not_lease_owner')
  if (job.leaseToken !== args.expectedLeaseToken) throw new Error('not_lease_owner')
  const now = Date.now()
  if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= now) throw new Error('lease_expired')
  const node = await ctx.db.query('nodes').withIndex('by_installation_node', (q) =>
    q.eq('installationId', args.installationId).eq('nodeId', args.nodeId),
  ).unique()
  if (node === null || node.status !== 'online') throw new Error('inactive_node')
  if (now < node.lastHeartbeatAt || now - node.lastHeartbeatAt > NODE_HEARTBEAT_TIMEOUT_MS) throw new Error('stale_heartbeat')
  const required = job.requiredCapabilities ?? [REMINDER_CAPABILITY]
  if (!required.every((capability) => node.capabilities.includes(capability))) throw new Error('missing_capability')
  return job
}
