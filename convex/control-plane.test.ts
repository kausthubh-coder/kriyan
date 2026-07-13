import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function backend() {
  return convexTest(schema, modules)
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
  return await t.mutation(internal.coordination.registerNode, {
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
    expect(
      await t.query(api.read.jobs, { installationId: 'installation-a' }),
    ).toHaveLength(1)
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

    expect(
      await t.query(api.read.jobs, { installationId: 'installation-a' }),
    ).toHaveLength(1)
    expect(
      await t.query(api.read.jobs, { installationId: 'installation-b' }),
    ).toHaveLength(1)
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
      await t.mutation(internal.coordination.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: registration.node.revision,
        now: 3,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(internal.coordination.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 0,
        now: 4,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    expect(
      await t.mutation(internal.coordination.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 1,
        now: 5,
      }),
    ).toEqual({ ok: true, revision: 2 })
    expect(
      await t.mutation(internal.coordination.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 2,
        now: 6,
      }),
    ).toEqual({ ok: false, reason: 'invalid_state' })
  })

  test('serializes parallel claims so only one worker gets the job', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await registerNode(t, 'node-b')
    await submit(t)

    const claims = await Promise.all([
      t.mutation(internal.coordination.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        now: 10,
        leaseDurationMs: 100,
      }),
      t.mutation(internal.coordination.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-b',
        now: 10,
        leaseDurationMs: 100,
      }),
    ])

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1)
    expect(claims.filter((claim) => claim === null)).toHaveLength(1)
    const jobs = await t.query(api.read.jobs, {
      installationId: 'installation-a',
    })
    expect(jobs[0]).toMatchObject({ status: 'leased', attempt: 1, revision: 1 })
  })

  test('renews a valid lease and rejects stale or expired versions', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t)
    const claim = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    expect(claim).not.toBeNull()
    if (claim === null) throw new Error('expected claim')

    const renewed = await t.mutation(internal.coordination.renewLease, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedRevision: claim.job.revision,
      now: 15,
      leaseDurationMs: 10,
    })
    expect(renewed).toEqual({ ok: true, revision: 2 })
    expect(
      await t.mutation(internal.coordination.renewLease, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedRevision: claim.job.revision,
        now: 16,
        leaseDurationMs: 10,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    expect(
      await t.mutation(internal.coordination.renewLease, {
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
    const claim = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(internal.coordination.startRun, {
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
    expect(await t.mutation(internal.coordination.completeRun, shared)).toEqual(
      { ok: false, reason: 'lease_expired' },
    )
    expect(
      await t.mutation(internal.coordination.failRun, {
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
    const firstClaim = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 10,
    })
    if (firstClaim === null) throw new Error('expected first claim')
    const started = await t.mutation(internal.coordination.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: firstClaim.job.revision,
      now: 11,
    })
    expect(started.ok).toBe(true)

    const reclaimed = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-b',
      now: 20,
      leaseDurationMs: 10,
    })
    expect(reclaimed).toMatchObject({
      reclaimed: true,
      job: { attempt: 2, status: 'leased' },
    })
    const runs = await t.query(api.read.runs, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'failed', error: 'lease expired' })
  })

  test('orders and deduplicates events before idempotent completion', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t)
    const claim = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(internal.coordination.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error(`start failed: ${started.reason}`)
    const duplicateStart = await t.mutation(internal.coordination.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    expect(duplicateStart).toMatchObject({ ok: true, created: false })

    const firstEventArgs = {
      installationId: 'installation-a',
      runId: started.run.runId,
      eventId: 'event-1',
      sequence: 1,
      type: 'status' as const,
      data: 'started',
      expectedRunRevision: 0,
      now: 12,
    }
    expect(
      await t.mutation(internal.coordination.appendRunEvent, firstEventArgs),
    ).toMatchObject({
      ok: true,
      duplicate: false,
      revision: 1,
    })
    expect(
      await t.mutation(internal.coordination.appendRunEvent, firstEventArgs),
    ).toMatchObject({
      ok: true,
      duplicate: true,
      revision: 1,
    })
    expect(
      await t.mutation(internal.coordination.appendRunEvent, {
        ...firstEventArgs,
        eventId: 'event-3',
        sequence: 3,
        expectedRunRevision: 1,
      }),
    ).toEqual({ ok: false, reason: 'out_of_order' })
    const second = await t.mutation(internal.coordination.appendRunEvent, {
      ...firstEventArgs,
      eventId: 'event-2',
      sequence: 2,
      data: 'done',
      expectedRunRevision: 1,
      now: 13,
    })
    expect(second).toMatchObject({ ok: true, duplicate: false, revision: 2 })

    const completionArgs = {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: 2,
      now: 14,
    }
    expect(
      await t.mutation(internal.coordination.completeRun, completionArgs),
    ).toEqual({
      ok: true,
      revision: 3,
    })
    expect(
      await t.mutation(internal.coordination.completeRun, completionArgs),
    ).toEqual({
      ok: true,
      revision: 3,
    })
    expect(
      await t.query(api.read.runEvents, {
        installationId: 'installation-a',
        runId: started.run.runId,
      }),
    ).toHaveLength(2)
  })
})

describe('terminal transitions and projections', () => {
  test('allows an explicit retry when attempts remain', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t, 'manual-retry-command', 'installation-a', 3)
    const claim = await t.mutation(internal.coordination.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      now: 10,
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(internal.coordination.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
      now: 11,
    })
    if (!started.ok) throw new Error('expected run')
    await t.mutation(internal.coordination.failRun, {
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
    const [failedJob] = await t.query(api.read.jobs, {
      installationId: 'installation-a',
    })
    if (failedJob === undefined) throw new Error('expected failed job')
    expect(failedJob.status).toBe('failed')
    expect(
      await t.mutation(internal.coordination.retryJob, {
        installationId: 'installation-a',
        jobId: failedJob.jobId,
        expectedRevision: failedJob.revision,
        now: 13,
      }),
    ).toEqual({ ok: true, revision: failedJob.revision + 1 })
    expect(
      (await t.query(api.read.jobs, { installationId: 'installation-a' }))[0]
        ?.status,
    ).toBe('queued')
  })

  test('retries retryable failures, exhausts attempts, and refuses another retry', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t, 'failure-command', 'installation-a', 2)

    for (const attempt of [1, 2]) {
      const claim = await t.mutation(internal.coordination.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        now: attempt * 10,
        leaseDurationMs: 100,
      })
      if (claim === null) throw new Error('expected claim')
      const started = await t.mutation(internal.coordination.startRun, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedJobRevision: claim.job.revision,
        now: attempt * 10 + 1,
      })
      if (!started.ok) throw new Error('expected run')
      const failed = await t.mutation(internal.coordination.failRun, {
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
    const [job] = await t.query(api.read.jobs, {
      installationId: 'installation-a',
    })
    expect(job).toMatchObject({ status: 'failed', attempt: 2 })
    if (job === undefined) throw new Error('expected job')
    expect(
      await t.mutation(internal.coordination.retryJob, {
        installationId: 'installation-a',
        jobId: job.jobId,
        expectedRevision: job.revision,
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
    expect(
      (await t.query(api.read.jobs, { installationId: 'installation-a' }))[0]
        ?.status,
    ).toBe('cancelled')
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
      await t.mutation(internal.coordination.putTask, taskArgs),
    ).toMatchObject({ created: true })
    expect(
      await t.mutation(internal.coordination.putTask, taskArgs),
    ).toMatchObject({ created: false })
    expect(
      await t.mutation(internal.coordination.putReminder, reminderArgs),
    ).toMatchObject({
      created: true,
    })
    expect(
      await t.mutation(internal.coordination.putReminder, reminderArgs),
    ).toMatchObject({
      created: false,
    })
    expect(
      await t.query(api.read.tasks, { installationId: 'installation-a' }),
    ).toHaveLength(1)
    expect(
      await t.query(api.read.reminders, { installationId: 'installation-a' }),
    ).toHaveLength(1)
    expect(
      await t.query(api.read.tasks, { installationId: 'other-installation' }),
    ).toEqual([])
    await expect(
      t.mutation(internal.coordination.putReminder, {
        ...reminderArgs,
        message: 'conflicting message',
      }),
    ).rejects.toThrow('idempotency key conflicts')
  })
})
