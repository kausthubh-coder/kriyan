import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  assertId,
  assertInput,
  assertExpectedRevision,
  assertPositiveInteger,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import { commandValue, jobValue } from './validators'

const submissionResult = v.object({
  created: v.boolean(),
  command: commandValue,
  job: jobValue,
})

export const submit = mutation({
  args: {
    installationId: v.string(),
    commandId: v.string(),
    idempotencyKey: v.string(),
    input: v.string(),
    maxAttempts: v.number(),
  },
  returns: submissionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.commandId, 'commandId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertInput(args.input)
    assertPositiveInteger(args.maxAttempts, 'maxAttempts', 10)
    const now = Date.now()

    const installation = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()
    if (installation === null) {
      throw new Error('installation not found')
    }

    const existing = await ctx.db
      .query('commands')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (existing !== null) {
      if (
        existing.commandId !== args.commandId ||
        existing.input !== args.input ||
        existing.status === 'cancelled'
      ) {
        throw new Error('idempotency key conflicts with an existing command')
      }
      const existingJob = await ctx.db
        .query('jobs')
        .withIndex('by_installation_command', (q) =>
          q
            .eq('installationId', args.installationId)
            .eq('commandId', existing.commandId),
        )
        .unique()
      if (existingJob === null) {
        throw new Error('existing command is missing its job')
      }
      return {
        created: false,
        command: withoutSystemFields(existing),
        job: withoutSystemFields(existingJob),
      }
    }

    const duplicateCommandId = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    if (duplicateCommandId !== null) {
      throw new Error('commandId already exists')
    }

    const jobId = `job:${args.commandId}`
    assertId(jobId, 'derived jobId')
    const commandDoc = {
      installationId: args.installationId,
      commandId: args.commandId,
      idempotencyKey: args.idempotencyKey,
      input: args.input,
      status: 'accepted' as const,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    const jobDoc = {
      installationId: args.installationId,
      jobId,
      commandId: args.commandId,
      status: 'queued' as const,
      attempt: 0,
      maxAttempts: args.maxAttempts,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('commands', commandDoc)
    await ctx.db.insert('jobs', jobDoc)
    return { created: true, command: commandDoc, job: jobDoc }
  },
})

export const get = query({
  args: { installationId: v.string(), commandId: v.string() },
  returns: v.union(v.null(), commandValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.commandId, 'commandId')
    const command = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    return command === null ? null : withoutSystemFields(command)
  },
})

export const list = query({
  args: {
    installationId: v.string(),
    status: v.optional(
      v.union(
        v.literal('accepted'),
        v.literal('completed'),
        v.literal('failed'),
        v.literal('cancelled'),
      ),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commandValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page =
      args.status === undefined
        ? await ctx.db
            .query('commands')
            .withIndex('by_installation_command', (q) =>
              q.eq('installationId', args.installationId),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query('commands')
            .withIndex('by_installation_status', (q) =>
              q
                .eq('installationId', args.installationId)
                .eq('status', args.status!),
            )
            .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const retry = mutation({
  args: {
    installationId: v.string(),
    commandId: v.string(),
    expectedCommandRevision: v.number(),
    expectedJobRevision: v.number(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      commandRevision: v.number(),
      jobRevision: v.number(),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal('not_found'),
        v.literal('stale_revision'),
        v.literal('invalid_state'),
        v.literal('attempts_exhausted'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.commandId, 'commandId')
    assertExpectedRevision(args.expectedCommandRevision)
    assertExpectedRevision(args.expectedJobRevision)
    const now = Date.now()
    const command = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    if (command === null || job === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (
      command.revision !== args.expectedCommandRevision ||
      job.revision !== args.expectedJobRevision
    ) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (command.status !== 'failed' || job.status !== 'failed') {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    if (job.attempt >= job.maxAttempts) {
      return { ok: false as const, reason: 'attempts_exhausted' as const }
    }
    await ctx.db.patch(command._id, {
      status: 'accepted',
      revision: command.revision + 1,
      updatedAt: now,
    })
    await ctx.db.patch(job._id, {
      status: 'queued',
      lastError: undefined,
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: now,
    })
    return {
      ok: true as const,
      commandRevision: command.revision + 1,
      jobRevision: job.revision + 1,
    }
  },
})

export const cancel = mutation({
  args: {
    installationId: v.string(),
    commandId: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), revision: v.number() }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal('not_found'),
        v.literal('stale_revision'),
        v.literal('already_terminal'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.commandId, 'commandId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
    const command = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    if (command === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (command.status !== 'accepted') {
      return { ok: false as const, reason: 'already_terminal' as const }
    }
    if (command.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', args.commandId),
      )
      .unique()
    if (job === null) throw new Error('command is missing its job')
    if (job.status === 'succeeded' || job.status === 'failed') {
      return { ok: false as const, reason: 'already_terminal' as const }
    }
    await ctx.db.patch(command._id, {
      status: 'cancelled',
      revision: command.revision + 1,
      updatedAt: now,
    })
    await ctx.db.patch(job._id, {
      status: 'cancelled',
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: now,
    })
    const activeRun = await ctx.db
      .query('runs')
      .withIndex('by_installation_job_attempt', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('jobId', job.jobId)
          .eq('attempt', job.attempt),
      )
      .unique()
    if (activeRun?.status === 'running') {
      await ctx.db.patch(activeRun._id, {
        status: 'cancelled',
        revision: activeRun.revision + 1,
        finishedAt: now,
      })
    }
    return { ok: true as const, revision: command.revision + 1 }
  },
})
