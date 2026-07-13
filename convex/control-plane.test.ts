import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function backend() {
  return convexTest(schema, modules)
}

const paginationOpts = { numItems: 100, cursor: null }

async function readJobs(
  t: ReturnType<typeof backend>,
  installationId = 'installation-a',
) {
  return (await t.query(api.read.jobs, { installationId, paginationOpts })).page
}

async function readRuns(
  t: ReturnType<typeof backend>,
  jobId: string,
  installationId = 'installation-a',
) {
  return (
    await t.query(api.read.runs, { installationId, jobId, paginationOpts })
  ).page
}

async function readEvents(
  t: ReturnType<typeof backend>,
  runId: string,
  installationId = 'installation-a',
) {
  return (
    await t.query(api.read.runEvents, {
      installationId,
      runId,
      paginationOpts,
    })
  ).page
}

async function createInstallation(
  t: ReturnType<typeof backend>,
  installationId = 'installation-a',
) {
  return await t.mutation(api.installations.create, {
    installationId,
    timezone: 'America/New_York',
    protocolVersion: '1',
    now: 1,
  })
}

async function registerNode(
  t: ReturnType<typeof backend>,
  nodeId: string,
  installationId = 'installation-a',
) {
  return await t.mutation(api.worker.registerNode, {
    installationId,
    nodeId,
    displayName: nodeId,
    capabilities: ['reminders'],
    protocolVersion: '1',
    now: 2,
  })
}

async function submit(
  t: ReturnType<typeof backend>,
  commandId = 'command-a',
  installationId = 'installation-a',
  maxAttempts = 3,
) {
  return await t.mutation(api.commands.submit, {
    installationId,
    commandId,
    idempotencyKey: `idempotency:${commandId}`,
    input: 'remind me tomorrow at 8 to practice Korean',
    maxAttempts,
    now: 3,
  })
}

describe('command submission', () => {
  test('creates at most one job and rejects idempotency conflicts', async () => {
    const t = backend()
    await createInstallation(t)

    const first = await submit(t)
    const duplicate = await submit(t)

    expect(first.created).toBe(true)
    expect(duplicate.created).toBe(false)
    expect(duplicate.job.jobId).toBe(first.job.jobId)
    expect(await readJobs(t)).toHaveLength(1)
    await expect(
      t.mutation(api.commands.submit, {
        installationId: 'installation-a',
        commandId: 'different-command',
        idempotencyKey: 'idempotency:command-a',
        input: 'different input',
        maxAttempts: 3,
        now: 4,
      }),
    ).rejects.toThrow('idempotency key conflicts')
  })

  test('enforces bounded input and installation scope', async () => {
    const t = backend()
    await createInstallation(t, 'installation-a')
    await createInstallation(t, 'installation-b')
    await submit(t, 'same-command', 'installation-a')
    await submit(t, 'same-command', 'installation-b')

    expect(await readJobs(t, 'installation-a')).toHaveLength(1)
    expect(await readJobs(t, 'installation-b')).toHaveLength(1)
    await expect(
      t.mutation(api.commands.submit, {
        installationId: 'installation-a',
        commandId: 'oversized',
        idempotencyKey: 'oversized',
        input: 'x'.repeat(8_193),
        maxAttempts: 3,
        now: 4,
      }),
    ).rejects.toThrow('input must contain')
  })
})

describe('leases and runs', () => {
  test('versions heartbeats and makes node revocation terminal', async () => {
    const t = backend()
    await createInstallation(t)
    const registration = await registerNode(t, 'node-a')
    expect(
      await t.mutation(api.worker.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: registration.node.revision,
        now: 3,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.worker.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 0,
        now: 4,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    expect(
      await t.mutation(api.worker.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 1,
        now: 5,
      }),
    ).toEqual({ ok: true, revision: 2 })
    expect(
      await t.mutation(api.worker.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 2,
        now: 6,
      }),
    ).toEqual({ ok: false, reason: 'inactive_node' })
  })

  test('serializes parallel claims so only one worker gets the job', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await registerNode(t, 'node-b')
    await submit(t)

    const claims = await Promise.all([
      t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        now: 10,
        leaseDurationMs: 100,
      }),
      t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-b',
        now: 10,
        leaseDurationMs: 100,
      }),
    ])

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1)
    expect(claims.filter((claim) => claim === null)).toHaveLength(1)
    const jobs = await readJobs(t)
    expect(jobs[0]).toMatchObject({
      status: 'leased',
      attempt: 1,
      revision: 1,
    })
  })

  test('renews a valid lease and rejects stale or expired versions', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t)
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    expect(claim).not.toBeNull()
    if (claim === null) throw new Error('expected claim')

    const renewed = await t.mutation(api.worker.renewLease, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedRevision: claim.job.revision,
      now: 15,
      leaseDurationMs: 10,
    })
    expect(renewed).toEqual({ ok: true, revision: 2 })
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedRevision: claim.job.revision,
        now: 16,
        leaseDurationMs: 10,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedRevision: 2,
        now: 25,
        leaseDurationMs: 10,
      }),
    ).toEqual({ ok: false, reason: 'lease_expired' })
  })

  test('rejects completion and failure reports after lease expiry', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t)
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')
    const shared = {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision,
      now: 20,
    }
    expect(await t.mutation(api.worker.completeRun, shared)).toEqual({
      ok: false,
      reason: 'lease_expired',
    })
    expect(
      await t.mutation(api.worker.failRun, {
        ...shared,
        error: 'late report',
        retryable: true,
      }),
    ).toEqual({ ok: false, reason: 'lease_expired' })
  })

  test('reclaims an expired running job and closes its abandoned run', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await registerNode(t, 'node-b')
    await submit(t, 'reclaim-command', 'installation-a', 2)
    const firstClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    if (firstClaim === null) throw new Error('expected first claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: firstClaim.job.revision,
      now: 11,
    })
    expect(started.ok).toBe(true)

    const reclaimed = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-b',
      now: 20,
      leaseDurationMs: 10,
    })
    expect(reclaimed).toMatchObject({
      reclaimed: true,
      job: { attempt: 2, status: 'leased' },
    })
    const runs = await readRuns(t, firstClaim.job.jobId)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      status: 'failed',
      error: 'lease reclaimed',
    })
  })

  test('orders and deduplicates events before idempotent completion', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t)
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error(`start failed: ${started.reason}`)
    const duplicateStart = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    expect(duplicateStart).toMatchObject({ ok: true, created: false })

    const firstEventArgs = {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: 0,
      events: [
        {
          eventId: 'event-1',
          sequence: 1,
          type: 'status' as const,
          data: 'started',
          createdAt: 12,
        },
        {
          eventId: 'event-2',
          sequence: 2,
          type: 'message' as const,
          data: 'done',
          createdAt: 13,
        },
      ],
      now: 12,
    }
    await expect(
      t.mutation(api.worker.appendRunEvents, {
        ...firstEventArgs,
        events: Array.from({ length: 33 }, (_, index) => ({
          eventId: `oversized-event-${index + 1}`,
          sequence: index + 1,
          type: 'status' as const,
          data: '',
          createdAt: 12,
        })),
      }),
    ).rejects.toThrow('events.length must be an integer between 1 and 32')
    expect(
      await t.mutation(api.worker.appendRunEvents, firstEventArgs),
    ).toMatchObject({
      ok: true,
      duplicate: false,
      revision: 2,
    })
    expect(
      await t.mutation(api.worker.appendRunEvents, firstEventArgs),
    ).toMatchObject({
      ok: true,
      duplicate: true,
      revision: 2,
    })
    expect(
      await t.mutation(api.worker.appendRunEvents, {
        ...firstEventArgs,
        events: [
          {
            eventId: 'event-4',
            sequence: 4,
            type: 'status',
            data: 'skipped',
            createdAt: 14,
          },
        ],
        expectedRunRevision: 2,
      }),
    ).toEqual({ ok: false, reason: 'out_of_order' })

    const completionArgs = {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: 2,
      now: 14,
    }
    expect(await t.mutation(api.worker.completeRun, completionArgs)).toEqual({
      ok: true,
      revision: 3,
    })
    expect(await t.mutation(api.worker.completeRun, completionArgs)).toEqual({
      ok: true,
      revision: 3,
    })
    expect(await readEvents(t, started.run.runId)).toHaveLength(2)
  })
})

describe('terminal transitions and projections', () => {
  test('allows an explicit retry when attempts remain', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    const submission = await submit(
      t,
      'manual-retry-command',
      'installation-a',
      3,
    )
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')
    await t.mutation(api.worker.failRun, {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      error: 'requires operator retry',
      retryable: false,
      expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision,
      now: 12,
    })
    const [failedJob] = await readJobs(t)
    if (failedJob === undefined) throw new Error('expected failed job')
    expect(failedJob.status).toBe('failed')
    expect(
      await t.mutation(api.commands.retry, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedCommandRevision: 1,
        expectedJobRevision: failedJob.revision,
        now: 13,
      }),
    ).toEqual({
      ok: true,
      commandRevision: 2,
      jobRevision: failedJob.revision + 1,
    })
    expect((await readJobs(t))[0]?.status).toBe('queued')
  })

  test('retries retryable failures, exhausts attempts, and refuses another retry', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    const submission = await submit(t, 'failure-command', 'installation-a', 2)

    for (const attempt of [1, 2]) {
      const claim = await t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        now: attempt * 10,
        leaseDurationMs: 100,
      })
      if (claim === null) throw new Error('expected claim')
      const started = await t.mutation(api.worker.startRun, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedJobRevision: claim.job.revision,
        now: attempt * 10 + 1,
      })
      if (!started.ok) throw new Error('expected run')
      const failed = await t.mutation(api.worker.failRun, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        runId: started.run.runId,
        nodeId: 'node-a',
        error: `failure ${attempt}`,
        retryable: true,
        expectedJobRevision: started.job.revision,
        expectedRunRevision: started.run.revision,
        now: attempt * 10 + 2,
      })
      expect(failed.ok).toBe(true)
    }
    const [job] = await readJobs(t)
    expect(job).toMatchObject({ status: 'failed', attempt: 2 })
    if (job === undefined) throw new Error('expected job')
    expect(
      await t.mutation(api.commands.retry, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedCommandRevision: 1,
        expectedJobRevision: job.revision,
        now: 30,
      }),
    ).toEqual({ ok: false, reason: 'attempts_exhausted' })
  })

  test('cancels queued work once and rejects stale cancellation', async () => {
    const t = backend()
    await createInstallation(t)
    const submission = await submit(t)
    expect(
      await t.mutation(api.commands.cancel, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedRevision: 0,
        now: 4,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.commands.cancel, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedRevision: 0,
        now: 5,
      }),
    ).toEqual({ ok: false, reason: 'already_terminal' })
    expect((await readJobs(t))[0]?.status).toBe('cancelled')
  })

  test('writes tasks and reminders idempotently and scopes reactive reads', async () => {
    const t = backend()
    await createInstallation(t)
    const taskArgs = {
      installationId: 'installation-a',
      taskId: 'task-a',
      idempotencyKey: 'projection:task-a',
      title: 'Practice Korean',
      status: 'open' as const,
      dueAt: 100,
      now: 10,
    }
    const reminderArgs = {
      installationId: 'installation-a',
      reminderId: 'reminder-a',
      idempotencyKey: 'projection:reminder-a',
      message: 'Practice Korean',
      remindAt: 100,
      timezone: 'America/New_York',
      status: 'scheduled' as const,
      now: 10,
    }
    expect(
      await t.mutation(api.projections.createTask, taskArgs),
    ).toMatchObject({ created: true })
    expect(
      await t.mutation(api.projections.createTask, taskArgs),
    ).toMatchObject({ created: false })
    expect(
      await t.mutation(api.projections.createReminder, reminderArgs),
    ).toMatchObject({
      created: true,
    })
    expect(
      await t.mutation(api.projections.createReminder, reminderArgs),
    ).toMatchObject({
      created: false,
    })
    expect(
      (
        await t.query(api.projections.listTasks, {
          installationId: 'installation-a',
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1)
    expect(
      (
        await t.query(api.projections.listReminders, {
          installationId: 'installation-a',
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1)
    expect(
      (
        await t.query(api.projections.listTasks, {
          installationId: 'other-installation',
          paginationOpts,
        })
      ).page,
    ).toEqual([])
    await expect(
      t.mutation(api.projections.createReminder, {
        ...reminderArgs,
        message: 'conflicting message',
      }),
    ).rejects.toThrow('reminderId or idempotencyKey conflicts')
  })
})

describe('round 1 rejection regressions', () => {
  test('revoked nodes cannot renew and revocation atomically releases their run and lease', async () => {
    const t = backend()
    await createInstallation(t)
    const registration = await registerNode(t, 'node-a')
    await submit(t, 'revocation-command')
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')

    expect(
      await t.mutation(api.worker.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: registration.node.revision,
        now: 12,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        nodeId: 'node-a',
        expectedRevision: started.job.revision,
        now: 13,
        leaseDurationMs: 100,
      }),
    ).toEqual({ ok: false, reason: 'inactive_node' })
    const [releasedJob] = await readJobs(t)
    expect(releasedJob).toMatchObject({
      status: 'queued',
      lastError: 'node revoked',
    })
    expect(releasedJob?.leaseOwnerNodeId).toBeUndefined()
    expect(releasedJob?.leaseExpiresAt).toBeUndefined()
    expect((await readRuns(t, started.job.jobId))[0]).toMatchObject({
      status: 'failed',
      error: 'node revoked',
      finishedAt: 12,
    })
  })

  test('expired heartbeats and missing capabilities prevent new work and release owned work', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await t.mutation(api.worker.registerNode, {
      installationId: 'installation-a',
      nodeId: 'node-without-capability',
      displayName: 'node-without-capability',
      capabilities: [],
      protocolVersion: '1',
      now: 2,
    })
    await submit(t, 'heartbeat-command')
    await expect(
      t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-without-capability',
        now: 3,
        leaseDurationMs: 100,
      }),
    ).rejects.toThrow('missing_capability')
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 30_000,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        nodeId: 'node-a',
        expectedRevision: started.job.revision,
        now: 60_003,
        leaseDurationMs: 100,
      }),
    ).toEqual({ ok: false, reason: 'stale_heartbeat' })
    expect((await readJobs(t))[0]).toMatchObject({
      status: 'queued',
      lastError: 'stale_heartbeat',
    })
    expect((await readRuns(t, started.job.jobId))[0]).toMatchObject({
      status: 'failed',
      error: 'stale_heartbeat',
    })
  })

  test('final-attempt lease exhaustion closes the run and fails job and command coherently', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await registerNode(t, 'node-b')
    const submission = await submit(
      t,
      'exhaustion-command',
      'installation-a',
      1,
    )
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 5,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')

    expect(
      await t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-b',
        now: 16,
        leaseDurationMs: 5,
      }),
    ).toBeNull()
    expect((await readJobs(t))[0]).toMatchObject({
      status: 'failed',
      attempt: 1,
      lastError: 'attempts exhausted',
    })
    expect((await readRuns(t, started.job.jobId))[0]).toMatchObject({
      status: 'failed',
      finishedAt: 16,
    })
    expect(
      await t.query(api.commands.get, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
      }),
    ).toMatchObject({ status: 'failed' })
  })

  test('a manually retried job can succeed and moves its command back to completed', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    const submission = await submit(
      t,
      'retry-success-command',
      'installation-a',
      3,
    )
    const firstClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (firstClaim === null) throw new Error('expected claim')
    const firstRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: firstClaim.job.revision,
      now: 11,
    })
    if (!firstRun.ok) throw new Error('expected run')
    await t.mutation(api.worker.failRun, {
      installationId: 'installation-a',
      jobId: firstRun.job.jobId,
      runId: firstRun.run.runId,
      nodeId: 'node-a',
      error: 'operator review',
      retryable: false,
      expectedJobRevision: firstRun.job.revision,
      expectedRunRevision: firstRun.run.revision,
      now: 12,
    })
    const [failedJob] = await readJobs(t)
    if (failedJob === undefined) throw new Error('expected failed job')
    expect(
      await t.mutation(api.commands.retry, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedCommandRevision: 1,
        expectedJobRevision: failedJob.revision,
        now: 13,
      }),
    ).toMatchObject({ ok: true })
    const secondClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 14,
      leaseDurationMs: 100,
    })
    if (secondClaim === null) throw new Error('expected retry claim')
    const secondRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: secondClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: secondClaim.job.revision,
      now: 15,
    })
    if (!secondRun.ok) throw new Error('expected retry run')
    expect(
      await t.mutation(api.worker.completeRun, {
        installationId: 'installation-a',
        jobId: secondRun.job.jobId,
        runId: secondRun.run.runId,
        nodeId: 'node-a',
        expectedJobRevision: secondRun.job.revision,
        expectedRunRevision: secondRun.run.revision,
        now: 16,
      }),
    ).toMatchObject({ ok: true })
    expect(
      await t.query(api.commands.get, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
      }),
    ).toMatchObject({ status: 'completed' })
    expect((await readJobs(t))[0]).toMatchObject({ status: 'succeeded' })
  })

  test('logical task and reminder IDs stay unique across idempotency keys', async () => {
    const t = backend()
    await createInstallation(t)
    await t.mutation(api.projections.createTask, {
      installationId: 'installation-a',
      taskId: 'stable-task',
      idempotencyKey: 'task-key-a',
      title: 'Practice Korean',
      status: 'open',
      now: 10,
    })
    await expect(
      t.mutation(api.projections.createTask, {
        installationId: 'installation-a',
        taskId: 'stable-task',
        idempotencyKey: 'task-key-b',
        title: 'Duplicate',
        status: 'open',
        now: 11,
      }),
    ).rejects.toThrow('taskId or idempotencyKey conflicts')
    await t.mutation(api.projections.createReminder, {
      installationId: 'installation-a',
      reminderId: 'stable-reminder',
      idempotencyKey: 'reminder-key-a',
      message: 'Practice Korean',
      remindAt: 100,
      timezone: 'America/New_York',
      status: 'scheduled',
      now: 10,
    })
    await expect(
      t.mutation(api.projections.createReminder, {
        installationId: 'installation-a',
        reminderId: 'stable-reminder',
        idempotencyKey: 'reminder-key-b',
        message: 'Duplicate',
        remindAt: 101,
        timezone: 'America/New_York',
        status: 'scheduled',
        now: 11,
      }),
    ).rejects.toThrow('reminderId or idempotencyKey conflicts')
  })
})

describe('reactive projection API', () => {
  test('supports bounded filters, revision-aware updates, status, and tombstones', async () => {
    const t = backend()
    await createInstallation(t)
    const createdTask = await t.mutation(api.projections.createTask, {
      installationId: 'installation-a',
      taskId: 'crud-task',
      idempotencyKey: 'crud-task-key',
      title: 'First title',
      status: 'open',
      dueAt: 100,
      now: 10,
    })
    expect(
      await t.mutation(api.projections.updateTask, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        expectedRevision: createdTask.task.revision,
        title: 'Updated title',
        clearDueAt: true,
        now: 11,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.projections.setTaskStatus, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        expectedRevision: 1,
        status: 'completed',
        now: 12,
      }),
    ).toEqual({ ok: true, revision: 2 })
    expect(
      (
        await t.query(api.projections.listTasks, {
          installationId: 'installation-a',
          status: 'completed',
          dueBefore: 1_000,
          paginationOpts: { numItems: 1, cursor: null },
        })
      ).page,
    ).toHaveLength(0)
    expect(
      (
        await t.query(api.projections.listTasks, {
          installationId: 'installation-a',
          status: 'completed',
          paginationOpts: { numItems: 1, cursor: null },
        })
      ).page,
    ).toHaveLength(1)
    expect(
      await t.mutation(api.projections.tombstoneTask, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        expectedRevision: 2,
        now: 13,
      }),
    ).toEqual({ ok: true, revision: 3 })
    expect(
      await t.query(api.projections.getTask, {
        installationId: 'installation-a',
        taskId: 'crud-task',
      }),
    ).toBeNull()
    expect(
      await t.query(api.projections.getTask, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        includeDeleted: true,
      }),
    ).toMatchObject({ deletedAt: 13, revision: 3 })

    const createdReminder = await t.mutation(api.projections.createReminder, {
      installationId: 'installation-a',
      reminderId: 'crud-reminder',
      idempotencyKey: 'crud-reminder-key',
      message: 'Original',
      remindAt: 100,
      timezone: 'UTC',
      status: 'scheduled',
      now: 10,
    })
    expect(
      await t.mutation(api.projections.updateReminder, {
        installationId: 'installation-a',
        reminderId: 'crud-reminder',
        expectedRevision: createdReminder.reminder.revision,
        message: 'Updated',
        remindAt: 200,
        timezone: 'America/New_York',
        now: 11,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.projections.setReminderStatus, {
        installationId: 'installation-a',
        reminderId: 'crud-reminder',
        expectedRevision: 1,
        status: 'fired',
        now: 12,
      }),
    ).toEqual({ ok: true, revision: 2 })
    expect(
      (
        await t.query(api.projections.listReminders, {
          installationId: 'installation-a',
          status: 'fired',
          remindBefore: 250,
          paginationOpts: { numItems: 1, cursor: null },
        })
      ).page,
    ).toHaveLength(1)
    expect(
      await t.mutation(api.projections.tombstoneReminder, {
        installationId: 'installation-a',
        reminderId: 'crud-reminder',
        expectedRevision: 2,
        now: 13,
      }),
    ).toEqual({ ok: true, revision: 3 })
  })
})
