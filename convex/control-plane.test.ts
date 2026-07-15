import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function backend() {
  return convexTest(schema, modules)
}

const paginationOpts = { numItems: 100, cursor: null }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

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

async function readActivity(
  t: ReturnType<typeof backend>,
  numItems = 100,
  cursor: string | null = null,
  installationId = 'installation-a',
) {
  return await t.query(api.read.activity, {
    installationId,
    paginationOpts: { numItems, cursor },
  })
}

async function createInstallation(
  t: ReturnType<typeof backend>,
  installationId = 'installation-a',
) {
  return await t.mutation(api.installations.create, {
    installationId,
    timezone: 'America/New_York',
    protocolVersion: '1',
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
  })
}

describe('node registration', () => {
  test('renegotiates capabilities for a stable node identity across releases', async () => {
    const t = backend()
    await createInstallation(t)
    const first = await registerNode(t, 'node-upgrade')
    const upgraded = await t.mutation(api.worker.registerNode, {
      installationId: 'installation-a',
      nodeId: 'node-upgrade',
      displayName: 'node-upgrade',
      capabilities: ['reminders', 'agent.chat.v1'],
      protocolVersion: '1',
    })

    expect(first).toMatchObject({ created: true, node: { revision: 0 } })
    expect(upgraded).toMatchObject({
      created: false,
      node: { capabilities: ['reminders', 'agent.chat.v1'], revision: 1 },
    })
  })
})

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
      }),
    ).rejects.toThrow('input must contain')
  })
})

describe('coherent activity read model', () => {
  test('paginates more than 25 commands newest-first across page boundaries and reacts to a new submission', async () => {
    const t = backend()
    await createInstallation(t)
    for (let index = 0; index < 31; index += 1) {
      vi.setSystemTime(2_000 + index)
      await submit(t, `activity-command-${index}`)
    }

    const first = await readActivity(t, 25)
    expect(first.page).toHaveLength(25)
    expect(first.page[0]?.command.commandId).toBe('activity-command-30')
    expect(first.page.at(-1)?.command.commandId).toBe('activity-command-6')
    expect(first.isDone).toBe(false)

    const second = await readActivity(t, 25, first.continueCursor)
    expect(second.page.map((item) => item.command.commandId)).toEqual([
      'activity-command-5',
      'activity-command-4',
      'activity-command-3',
      'activity-command-2',
      'activity-command-1',
      'activity-command-0',
    ])
    expect(second.isDone).toBe(true)

    vi.setSystemTime(3_000)
    await submit(t, 'activity-command-new')
    const refreshed = await readActivity(t, 25)
    expect(refreshed.page[0]?.command.commandId).toBe('activity-command-new')
    expect(new Set([
      ...refreshed.page.map((item) => item.command.commandId),
      ...(await readActivity(t, 25, refreshed.continueCursor)).page.map((item) => item.command.commandId),
    ]).size).toBe(32)
  })

  test('joins the current job and exact attempt through retry, running, completion, and exhaustion', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'activity-node')
    const submission = await submit(t, 'activity-retry-command', 'installation-a', 3)
    const firstClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'activity-node',
      leaseDurationMs: 100,
    })
    if (firstClaim === null) throw new Error('expected first claim')
    const firstRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'activity-node',
      expectedJobRevision: firstClaim.job.revision,
    })
    if (!firstRun.ok) throw new Error('expected first run')
    await t.mutation(api.worker.failRun, {
      installationId: 'installation-a',
      jobId: firstRun.job.jobId,
      runId: firstRun.run.runId,
      nodeId: 'activity-node',
      error: 'operator retry',
      retryable: false,
      expectedJobRevision: firstRun.job.revision,
      expectedRunRevision: firstRun.run.revision,
    })
    const failed = (await readActivity(t)).page[0]!
    expect(failed).toMatchObject({
      command: { status: 'failed' },
      job: { status: 'failed', attempt: 1 },
      run: { status: 'failed', attempt: 1 },
    })

    await t.mutation(api.commands.retry, {
      installationId: 'installation-a',
      commandId: submission.command.commandId,
      expectedCommandRevision: failed.command.revision,
      expectedJobRevision: failed.job!.revision,
    })
    const queued = (await readActivity(t)).page[0]!
    expect(queued).toMatchObject({
      command: { status: 'accepted' },
      job: { status: 'queued', attempt: 1 },
      run: { status: 'failed', attempt: 1 },
    })

    const secondClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'activity-node',
      leaseDurationMs: 100,
    })
    if (secondClaim === null) throw new Error('expected second claim')
    const leased = (await readActivity(t)).page[0]
    expect(leased).toMatchObject({ job: { status: 'leased', attempt: 2 } })
    expect(leased?.run).toBeUndefined()
    const secondRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: secondClaim.job.jobId,
      nodeId: 'activity-node',
      expectedJobRevision: secondClaim.job.revision,
    })
    if (!secondRun.ok) throw new Error('expected second run')
    expect((await readActivity(t)).page[0]).toMatchObject({
      job: { status: 'running', attempt: 2 },
      run: { status: 'running', attempt: 2 },
    })
    await t.mutation(api.worker.completeRun, {
      installationId: 'installation-a',
      jobId: secondRun.job.jobId,
      runId: secondRun.run.runId,
      nodeId: 'activity-node',
      expectedJobRevision: secondRun.job.revision,
      expectedRunRevision: secondRun.run.revision,
    })
    expect((await readActivity(t)).page[0]).toMatchObject({
      command: { status: 'completed' },
      job: { status: 'succeeded', attempt: 2 },
      run: { status: 'succeeded', attempt: 2 },
    })

    vi.setSystemTime(4_000)
    const exhaustedSubmission = await submit(t, 'activity-exhausted-command', 'installation-a', 1)
    const exhaustedClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'activity-node',
      leaseDurationMs: 100,
    })
    if (exhaustedClaim === null) throw new Error('expected exhausted claim')
    const exhaustedRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: exhaustedClaim.job.jobId,
      nodeId: 'activity-node',
      expectedJobRevision: exhaustedClaim.job.revision,
    })
    if (!exhaustedRun.ok) throw new Error('expected exhausted run')
    await t.mutation(api.worker.failRun, {
      installationId: 'installation-a',
      jobId: exhaustedRun.job.jobId,
      runId: exhaustedRun.run.runId,
      nodeId: 'activity-node',
      error: 'final failure',
      retryable: true,
      expectedJobRevision: exhaustedRun.job.revision,
      expectedRunRevision: exhaustedRun.run.revision,
    })
    const exhausted = (await readActivity(t)).page[0]!
    expect(exhausted).toMatchObject({ command: { status: 'failed' }, job: { status: 'failed', attempt: 1, maxAttempts: 1 }, run: { status: 'failed', attempt: 1 } })
    expect(await t.mutation(api.commands.retry, {
      installationId: 'installation-a',
      commandId: exhaustedSubmission.command.commandId,
      expectedCommandRevision: exhausted.command.revision,
      expectedJobRevision: exhausted.job!.revision,
    })).toEqual({ ok: false, reason: 'attempts_exhausted' })
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
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.worker.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 0,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    expect(
      await t.mutation(internal.worker.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: true,
      revision: 2,
      releasedWork: 0,
      cleanupPending: false,
    })
    expect(
      await t.mutation(api.worker.heartbeatNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: 2,
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
        leaseDurationMs: 100,
      }),
      t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-b',
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
      leaseDurationMs: 10,
    })
    expect(claim).not.toBeNull()
    if (claim === null) throw new Error('expected claim')

    vi.setSystemTime(1_005)
    const renewed = await t.mutation(api.worker.renewLease, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedRevision: claim.job.revision,
      leaseDurationMs: 10,
    })
    expect(renewed).toEqual({ ok: true, revision: 2 })
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedRevision: claim.job.revision,
        leaseDurationMs: 10,
      }),
    ).toEqual({ ok: false, reason: 'stale_revision' })
    vi.setSystemTime(1_015)
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedRevision: 2,
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
      leaseDurationMs: 10,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')
    const shared = {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision,
    }
    vi.setSystemTime(1_010)
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
      leaseDurationMs: 10,
    })
    if (firstClaim === null) throw new Error('expected first claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: firstClaim.job.revision,
    })
    expect(started.ok).toBe(true)

    vi.setSystemTime(1_010)
    const reclaimed = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-b',
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
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error(`start failed: ${started.reason}`)
    const duplicateStart = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
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
        },
        {
          eventId: 'event-2',
          sequence: 2,
          type: 'message' as const,
          data: 'done',
        },
      ],
    }
    await expect(
      t.mutation(api.worker.appendRunEvents, {
        ...firstEventArgs,
        events: Array.from({ length: 33 }, (_, index) => ({
          eventId: `oversized-event-${index + 1}`,
          sequence: index + 1,
          type: 'status' as const,
          data: '',
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
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
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
        leaseDurationMs: 100,
      })
      if (claim === null) throw new Error('expected claim')
      const started = await t.mutation(api.worker.startRun, {
        installationId: 'installation-a',
        jobId: claim.job.jobId,
        nodeId: 'node-a',
        expectedJobRevision: claim.job.revision,
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
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.commands.cancel, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedRevision: 0,
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
    }
    const reminderArgs = {
      installationId: 'installation-a',
      reminderId: 'reminder-a',
      idempotencyKey: 'projection:reminder-a',
      message: 'Practice Korean',
      remindAt: 100,
      timezone: 'America/New_York',
      status: 'scheduled' as const,
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
      leaseDurationMs: 100,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')

    expect(
      await t.mutation(internal.worker.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: registration.node.revision,
      }),
    ).toEqual({
      ok: true,
      revision: 1,
      releasedWork: 1,
      cleanupPending: false,
    })
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        nodeId: 'node-a',
        expectedRevision: started.job.revision,
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
      finishedAt: 1_000,
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
    })
    await submit(t, 'heartbeat-command')
    await expect(
      t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-without-capability',
        leaseDurationMs: 100,
      }),
    ).rejects.toThrow('missing_capability')
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 30_000,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')
    vi.setSystemTime(61_001)
    expect(
      await t.mutation(api.worker.renewLease, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        nodeId: 'node-a',
        expectedRevision: started.job.revision,
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
      leaseDurationMs: 5,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')

    vi.setSystemTime(1_005)
    expect(
      await t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-b',
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
      finishedAt: 1_005,
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
      leaseDurationMs: 100,
    })
    if (firstClaim === null) throw new Error('expected claim')
    const firstRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: firstClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: firstClaim.job.revision,
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
    })
    const [failedJob] = await readJobs(t)
    if (failedJob === undefined) throw new Error('expected failed job')
    expect(
      await t.mutation(api.commands.retry, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedCommandRevision: 1,
        expectedJobRevision: failedJob.revision,
      }),
    ).toMatchObject({ ok: true })
    const secondClaim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 100,
    })
    if (secondClaim === null) throw new Error('expected retry claim')
    const secondRun = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: secondClaim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: secondClaim.job.revision,
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
    })
    await expect(
      t.mutation(api.projections.createTask, {
        installationId: 'installation-a',
        taskId: 'stable-task',
        idempotencyKey: 'task-key-b',
        title: 'Duplicate',
        status: 'open',
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
    })
    expect(
      await t.mutation(api.projections.updateTask, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        expectedRevision: createdTask.task.revision,
        title: 'Updated title',
        clearDueAt: true,
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.projections.setTaskStatus, {
        installationId: 'installation-a',
        taskId: 'crud-task',
        expectedRevision: 1,
        status: 'completed',
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
    ).toMatchObject({ deletedAt: 1_000, revision: 3 })

    const createdReminder = await t.mutation(api.projections.createReminder, {
      installationId: 'installation-a',
      reminderId: 'crud-reminder',
      idempotencyKey: 'crud-reminder-key',
      message: 'Original',
      remindAt: 100,
      timezone: 'UTC',
      status: 'scheduled',
    })
    expect(
      await t.mutation(api.projections.updateReminder, {
        installationId: 'installation-a',
        reminderId: 'crud-reminder',
        expectedRevision: createdReminder.reminder.revision,
        message: 'Updated',
        remindAt: 200,
        timezone: 'America/New_York',
      }),
    ).toEqual({ ok: true, revision: 1 })
    expect(
      await t.mutation(api.projections.setReminderStatus, {
        installationId: 'installation-a',
        reminderId: 'crud-reminder',
        expectedRevision: 1,
        status: 'fired',
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
      }),
    ).toEqual({ ok: true, revision: 3 })
  })
})

describe('round 2 rejection regressions', () => {
  test('uses the Convex clock for worker events and rejects completion after server-time lease expiry', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t, 'server-clock-command')
    vi.setSystemTime(2_000)
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 20,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')

    vi.setSystemTime(2_010)
    const appended = await t.mutation(api.worker.appendRunEvents, {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision,
      events: [
        {
          eventId: 'server-clock-event',
          sequence: 1,
          type: 'status',
          data: 'server timestamp only',
        },
      ],
    })
    if (!appended.ok) throw new Error('expected event append')
    expect(appended.events[0]?.createdAt).toBe(2_010)

    vi.setSystemTime(2_020)
    expect(
      await t.mutation(api.worker.completeRun, {
        installationId: 'installation-a',
        jobId: started.job.jobId,
        runId: started.run.runId,
        nodeId: 'node-a',
        expectedJobRevision: started.job.revision,
        expectedRunRevision: appended.revision,
      }),
    ).toEqual({ ok: false, reason: 'lease_expired' })
  })

  test('never returns an empty tombstone-only page while live projections remain', async () => {
    const t = backend()
    await createInstallation(t)
    for (const suffix of ['a', 'b']) {
      await t.mutation(api.projections.createTask, {
        installationId: 'installation-a',
        taskId: `task-${suffix}`,
        idempotencyKey: `task-key-${suffix}`,
        title: `Task ${suffix}`,
        status: 'open',
      })
      await t.mutation(api.projections.createReminder, {
        installationId: 'installation-a',
        reminderId: `reminder-${suffix}`,
        idempotencyKey: `reminder-key-${suffix}`,
        message: `Reminder ${suffix}`,
        remindAt: 100,
        timezone: 'UTC',
        status: 'scheduled',
      })
    }
    await t.mutation(api.projections.tombstoneTask, {
      installationId: 'installation-a',
      taskId: 'task-a',
      expectedRevision: 0,
    })
    await t.mutation(api.projections.tombstoneReminder, {
      installationId: 'installation-a',
      reminderId: 'reminder-a',
      expectedRevision: 0,
    })

    const taskPage = await t.query(api.projections.listTasks, {
      installationId: 'installation-a',
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(taskPage.page.map((task) => task.taskId)).toEqual(['task-b'])
    expect(taskPage.isDone).toBe(true)
    const reminderPage = await t.query(api.projections.listReminders, {
      installationId: 'installation-a',
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(reminderPage.page.map((reminder) => reminder.reminderId)).toEqual([
      'reminder-b',
    ])
    expect(reminderPage.isDone).toBe(true)
  })

  test('revokes 70 owned jobs with concurrent idempotent continuation', async () => {
    const t = backend()
    await createInstallation(t)
    const registration = await registerNode(t, 'node-a')
    for (let index = 0; index < 70; index += 1) {
      await submit(t, `cleanup-command-${index}`)
      const claim = await t.mutation(api.worker.claimJob, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        leaseDurationMs: 30_000,
      })
      if (claim === null) throw new Error(`expected claim ${index}`)
    }

    expect(
      await t.mutation(internal.worker.revokeNode, {
        installationId: 'installation-a',
        nodeId: 'node-a',
        expectedRevision: registration.node.revision,
      }),
    ).toEqual({
      ok: true,
      revision: 1,
      releasedWork: 32,
      cleanupPending: true,
    })
    expect(
      (await readJobs(t)).filter((job) => job.leaseOwnerNodeId === 'node-a'),
    ).toHaveLength(38)
    const continuations = await Promise.all([
      t.mutation(internal.worker.continueNodeRevocationCleanup, {
        installationId: 'installation-a',
        nodeId: 'node-a',
      }),
      t.mutation(internal.worker.continueNodeRevocationCleanup, {
        installationId: 'installation-a',
        nodeId: 'node-a',
      }),
    ])
    expect(continuations).toEqual(
      expect.arrayContaining([
        { ok: true, releasedWork: 32, cleanupPending: true },
        { ok: true, releasedWork: 6, cleanupPending: false },
      ]),
    )
    expect(
      await t.mutation(internal.worker.continueNodeRevocationCleanup, {
        installationId: 'installation-a',
        nodeId: 'node-a',
      }),
    ).toEqual({ ok: true, releasedWork: 0, cleanupPending: false })
    expect(
      (await readJobs(t)).filter((job) => job.leaseOwnerNodeId === 'node-a'),
    ).toHaveLength(0)
  })
})

describe('round 4 rejection regressions', () => {
  test('server creation time preserves submit order for claims', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')

    vi.setSystemTime(1_100)
    await submit(t, 'submitted-first')
    vi.setSystemTime(1_200)
    await submit(t, 'submitted-second')

    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 100,
    })
    expect(claim?.job.commandId).toBe('submitted-first')
    expect(claim?.job.createdAt).toBe(1_100)
  })

  test('cancellation uses server time for every lifecycle timestamp', async () => {
    const t = backend()
    await createInstallation(t)
    await registerNode(t, 'node-a')
    const submission = await submit(t, 'server-cancel-command')
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 30_000,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')

    vi.setSystemTime(2_000)
    expect(
      await t.mutation(api.commands.cancel, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
        expectedRevision: submission.command.revision,
      }),
    ).toEqual({ ok: true, revision: 1 })

    expect(
      await t.query(api.commands.get, {
        installationId: 'installation-a',
        commandId: submission.command.commandId,
      }),
    ).toMatchObject({ status: 'cancelled', updatedAt: 2_000 })
    expect((await readJobs(t))[0]).toMatchObject({
      status: 'cancelled',
      updatedAt: 2_000,
    })
    expect((await readRuns(t, started.job.jobId))[0]).toMatchObject({
      status: 'cancelled',
      finishedAt: 2_000,
    })
  })

  test('filtered task and reminder cursors traverse every live page', async () => {
    const t = backend()
    await createInstallation(t)
    for (let index = 0; index < 6; index += 1) {
      await t.mutation(api.projections.createTask, {
        installationId: 'installation-a',
        taskId: `cursor-task-${index}`,
        idempotencyKey: `cursor-task-key-${index}`,
        title: `Task ${index}`,
        status: index === 5 ? 'completed' : 'open',
        dueAt: 100 + index,
      })
      await t.mutation(api.projections.createReminder, {
        installationId: 'installation-a',
        reminderId: `cursor-reminder-${index}`,
        idempotencyKey: `cursor-reminder-key-${index}`,
        message: `Reminder ${index}`,
        remindAt: 100 + index,
        timezone: 'UTC',
        status: index === 5 ? 'fired' : 'scheduled',
      })
    }
    await t.mutation(api.projections.tombstoneTask, {
      installationId: 'installation-a',
      taskId: 'cursor-task-1',
      expectedRevision: 0,
    })
    await t.mutation(api.projections.tombstoneReminder, {
      installationId: 'installation-a',
      reminderId: 'cursor-reminder-1',
      expectedRevision: 0,
    })

    const taskIds: string[] = []
    const reminderIds: string[] = []
    let taskCursor: string | null = null
    let reminderCursor: string | null = null
    let taskDone = false
    let reminderDone = false
    while (!taskDone) {
      const result = await t.query(api.projections.listTasks, {
        installationId: 'installation-a',
        status: 'open',
        dueBefore: 200,
        paginationOpts: { numItems: 2, cursor: taskCursor },
      })
      taskIds.push(...result.page.map((task) => task.taskId))
      taskCursor = result.continueCursor
      taskDone = result.isDone
    }
    while (!reminderDone) {
      const result = await t.query(api.projections.listReminders, {
        installationId: 'installation-a',
        status: 'scheduled',
        remindBefore: 200,
        paginationOpts: { numItems: 2, cursor: reminderCursor },
      })
      reminderIds.push(...result.page.map((reminder) => reminder.reminderId))
      reminderCursor = result.continueCursor
      reminderDone = result.isDone
    }
    expect(taskIds).toEqual([
      'cursor-task-0',
      'cursor-task-2',
      'cursor-task-3',
      'cursor-task-4',
    ])
    expect(reminderIds).toEqual([
      'cursor-reminder-0',
      'cursor-reminder-2',
      'cursor-reminder-3',
      'cursor-reminder-4',
    ])
  })

  test('internal dev cleanup is bounded, resumable, and idempotent across populated tables', async () => {
    const t = backend()
    vi.stubEnv('KRIYAN_DEV_DEPLOYMENT', 'qualified-sandpiper-726')
    await createInstallation(t)
    await registerNode(t, 'node-a')
    await submit(t, 'dev-cleanup-command')
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation-a',
      nodeId: 'node-a',
      leaseDurationMs: 30_000,
    })
    if (claim === null) throw new Error('expected claim')
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation-a',
      jobId: claim.job.jobId,
      nodeId: 'node-a',
      expectedJobRevision: claim.job.revision,
    })
    if (!started.ok) throw new Error('expected run')
    await t.mutation(api.worker.appendRunEvents, {
      installationId: 'installation-a',
      jobId: started.job.jobId,
      runId: started.run.runId,
      nodeId: 'node-a',
      expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision,
      events: [
        {
          eventId: 'dev-cleanup-event',
          sequence: 1,
          type: 'status',
          data: 'fixture',
        },
      ],
    })
    await t.mutation(api.projections.createTask, {
      installationId: 'installation-a',
      taskId: 'dev-cleanup-task',
      idempotencyKey: 'dev-cleanup-task-key',
      title: 'fixture',
      status: 'open',
    })
    await t.mutation(api.projections.createReminder, {
      installationId: 'installation-a',
      reminderId: 'dev-cleanup-reminder',
      idempotencyKey: 'dev-cleanup-reminder-key',
      message: 'fixture',
      remindAt: 2_000,
      timezone: 'UTC',
      status: 'scheduled',
    })

    const processedTables = new Set<string>()
    let done = false
    for (let call = 0; call < 16 && !done; call += 1) {
      const result = await t.mutation(internal.dev.resetInstallation, {
        deploymentName: 'qualified-sandpiper-726',
        installationId: 'installation-a',
        confirmation: 'RESET_KRIYAN_DEV',
        batchSize: 1,
      })
      if (result.processedTable !== null) {
        processedTables.add(result.processedTable)
      }
      expect(result.deleted).toBeLessThanOrEqual(1)
      done = result.done
    }
    expect(done).toBe(true)
    expect([...processedTables]).toEqual([
      'runEvents',
      'runs',
      'jobs',
      'commands',
      'tasks',
      'reminders',
      'nodes',
      'installations',
    ])
    expect(
      await t.mutation(internal.dev.resetInstallation, {
        deploymentName: 'qualified-sandpiper-726',
        installationId: 'installation-a',
        confirmation: 'RESET_KRIYAN_DEV',
        batchSize: 1,
      }),
    ).toEqual({
      deleted: 0,
      processedTable: null,
      nextTable: null,
      done: true,
    })

    const remaining = await t.run(async (ctx) => ({
      installations: await ctx.db
        .query('installations')
        .withIndex('by_installation_id', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      nodes: await ctx.db
        .query('nodes')
        .withIndex('by_installation_node', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      commands: await ctx.db
        .query('commands')
        .withIndex('by_installation_command', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      jobs: await ctx.db
        .query('jobs')
        .withIndex('by_installation_job', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      runs: await ctx.db
        .query('runs')
        .withIndex('by_installation_status', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      runEvents: await ctx.db
        .query('runEvents')
        .withIndex('by_installation_event', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      tasks: await ctx.db
        .query('tasks')
        .withIndex('by_installation_task', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
      reminders: await ctx.db
        .query('reminders')
        .withIndex('by_installation_reminder', (q) =>
          q.eq('installationId', 'installation-a'),
        )
        .take(1),
    }))
    expect(
      Object.values(remaining).every((records) => records.length === 0),
    ).toBe(true)
  })
})
