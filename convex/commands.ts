import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  assertId,
  assertInput,
  assertPositiveInteger,
  assertTimestamp,
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
    now: v.number(),
  },
  returns: submissionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.commandId, 'commandId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertInput(args.input)
    assertPositiveInteger(args.maxAttempts, 'maxAttempts', 10)
    assertTimestamp(args.now, 'now')

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
      createdAt: args.now,
      updatedAt: args.now,
    }
    const jobDoc = {
      installationId: args.installationId,
      jobId,
      commandId: args.commandId,
      status: 'queued' as const,
      attempt: 0,
      maxAttempts: args.maxAttempts,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
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
  args: { installationId: v.string() },
  returns: v.array(commandValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const commands = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    return commands.map(withoutSystemFields)
  },
})

export const cancel = mutation({
  args: {
    installationId: v.string(),
    commandId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
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
    assertTimestamp(args.now, 'now')
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
      updatedAt: args.now,
    })
    await ctx.db.patch(job._id, {
      status: 'cancelled',
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: args.now,
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
        finishedAt: args.now,
      })
    }
    return { ok: true as const, revision: command.revision + 1 }
  },
})
