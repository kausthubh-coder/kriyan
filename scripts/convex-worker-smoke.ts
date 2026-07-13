import { ConvexClient } from 'convex/browser'

import { api } from '../convex/_generated/api'

const convexUrl = Bun.env.CONVEX_URL
if (convexUrl === undefined || convexUrl.length === 0) {
  throw new Error('CONVEX_URL is required')
}

const fixtureId = `round2-${crypto.randomUUID()}`
const installationId = `installation:${fixtureId}`
const nodeId = `node:${fixtureId}`
const commandId = `command:${fixtureId}`
const client = new ConvexClient(convexUrl)

try {
  console.log(JSON.stringify({ phase: 'fixture', fixtureId, installationId }))
  const now = Date.now()
  await client.mutation(api.installations.create, {
    installationId,
    timezone: 'UTC',
    protocolVersion: '1',
    now,
  })
  await client.mutation(api.worker.registerNode, {
    installationId,
    nodeId,
    displayName: 'Round 2 external smoke worker',
    capabilities: ['reminders'],
    protocolVersion: '1',
    now,
  })
  await client.mutation(api.commands.submit, {
    installationId,
    commandId,
    idempotencyKey: `idempotency:${fixtureId}`,
    input: 'round 2 external worker facade smoke',
    maxAttempts: 2,
    now: now + 1,
  })
  const claim = await client.mutation(api.worker.claimJob, {
    installationId,
    nodeId,
    now: now + 2,
    leaseDurationMs: 30_000,
  })
  if (claim === null) throw new Error('external worker did not claim its job')
  const started = await client.mutation(api.worker.startRun, {
    installationId,
    jobId: claim.job.jobId,
    nodeId,
    expectedJobRevision: claim.job.revision,
    now: now + 3,
  })
  if (!started.ok) throw new Error(`external start failed: ${started.reason}`)
  const appended = await client.mutation(api.worker.appendRunEvents, {
    installationId,
    jobId: started.job.jobId,
    runId: started.run.runId,
    nodeId,
    expectedJobRevision: started.job.revision,
    expectedRunRevision: started.run.revision,
    events: [
      {
        eventId: `event:${fixtureId}:1`,
        sequence: 1,
        type: 'status',
        data: 'external Bun ConvexClient reached the worker facade',
        createdAt: now + 4,
      },
      {
        eventId: `event:${fixtureId}:2`,
        sequence: 2,
        type: 'message',
        data: 'ordered atomic batch accepted',
        createdAt: now + 5,
      },
    ],
    now: now + 5,
  })
  if (!appended.ok)
    throw new Error(`external append failed: ${appended.reason}`)
  const completed = await client.mutation(api.worker.completeRun, {
    installationId,
    jobId: started.job.jobId,
    runId: started.run.runId,
    nodeId,
    expectedJobRevision: started.job.revision,
    expectedRunRevision: appended.revision,
    now: now + 6,
  })
  if (!completed.ok)
    throw new Error(`external completion failed: ${completed.reason}`)
  const command = await client.query(api.commands.get, {
    installationId,
    commandId,
  })
  if (command?.status !== 'completed') {
    throw new Error(
      `unexpected command status: ${command?.status ?? 'missing'}`,
    )
  }
  console.log(
    JSON.stringify({
      ok: true,
      fixtureId,
      installationId,
      workerFacade: 'public ConvexClient',
      eventCount: appended.events.length,
      commandStatus: command.status,
    }),
  )
} finally {
  await client.close()
}
