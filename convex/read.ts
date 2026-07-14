import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import {
  assertId,
  assertPositiveInteger,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import {
  activityValue,
  clientSnapshotValue,
  jobStatus,
  jobValue,
  nodeValue,
  runEventValue,
  runValue,
} from './validators'

export const activity = query({
  args: {
    installationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(activityValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const commands = await ctx.db
      .query('commands')
      .withIndex('by_installation_created', (q) =>
        q.eq('installationId', args.installationId),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    const page = await Promise.all(commands.page.map(async (command) => {
      const job = await ctx.db
        .query('jobs')
        .withIndex('by_installation_command', (q) =>
          q
            .eq('installationId', args.installationId)
            .eq('commandId', command.commandId),
        )
        .unique()
      const run = job === null || job.attempt === 0
        ? null
        : await ctx.db
            .query('runs')
            .withIndex('by_installation_job_attempt', (q) =>
              q
                .eq('installationId', args.installationId)
                .eq('jobId', job.jobId)
                .eq('attempt', job.attempt),
            )
            .unique()
      return {
        command: withoutSystemFields(command),
        job: job === null ? undefined : withoutSystemFields(job),
        run: run === null ? undefined : withoutSystemFields(run),
      }
    }))
    return { ...commands, page }
  },
})

export const connectionProbe = query({
  args: {
    installationId: v.string(),
    connectionCount: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({ connectionCount: v.number(), installationUpdatedAt: v.number() }),
  ),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.connectionCount,
      'connectionCount',
      Number.MAX_SAFE_INTEGER,
    )
    const installation = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()
    return installation === null
      ? null
      : {
          connectionCount: args.connectionCount,
          installationUpdatedAt: installation.updatedAt,
        }
  },
})

export const nodes = query({
  args: {
    installationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(nodeValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId),
      )
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const jobs = query({
  args: {
    installationId: v.string(),
    status: v.optional(jobStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(jobValue),
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
            .query('jobs')
            .withIndex('by_installation_job', (q) =>
              q.eq('installationId', args.installationId),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query('jobs')
            .withIndex('by_installation_status_created', (q) =>
              q
                .eq('installationId', args.installationId)
                .eq('status', args.status!),
            )
            .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const runs = query({
  args: {
    installationId: v.string(),
    jobId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(runValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.jobId !== undefined) assertId(args.jobId, 'jobId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page =
      args.jobId === undefined
        ? await ctx.db
            .query('runs')
            .withIndex('by_installation_run', (q) =>
              q.eq('installationId', args.installationId),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query('runs')
            .withIndex('by_installation_job_attempt', (q) =>
              q
                .eq('installationId', args.installationId)
                .eq('jobId', args.jobId!),
            )
            .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const runEvents = query({
  args: {
    installationId: v.string(),
    runId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(runEventValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.runId, 'runId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = await ctx.db
      .query('runEvents')
      .withIndex('by_installation_run_sequence', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const clientSnapshot = query({
  args: { installationId: v.string() },
  returns: clientSnapshotValue,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const [installation, tasks, reminders, calendarEvents, notes, notificationIntents, sources, knowledge, nodes, commands, threads, messages, artifacts] = await Promise.all([
      ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique(),
      ctx.db.query('tasks').withIndex('by_installation_live_task', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('reminders').withIndex('by_installation_live_reminder', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('calendarEvents').withIndex('by_installation_live_start', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('notes').withIndex('by_installation_live_updated', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('notificationIntents').withIndex('by_installation_live_schedule', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('sourceRefs').withIndex('by_installation_live_kind', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('knowledgeDocuments').withIndex('by_installation_live_kind', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(100),
      ctx.db.query('nodes').withIndex('by_installation_node', (q) => q.eq('installationId', args.installationId)).take(100),
      ctx.db.query('commands').withIndex('by_installation_created', (q) => q.eq('installationId', args.installationId)).order('desc').take(100),
      ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId)).take(100),
      ctx.db.query('agentMessages').withIndex('by_installation_message', (q) => q.eq('installationId', args.installationId)).take(100),
      ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId)).take(100),
    ])
    const activity = await Promise.all(commands.map(async (command) => {
      const job = await ctx.db.query('jobs').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', command.commandId)).unique()
      const run = job === null || job.attempt === 0 ? null : await ctx.db.query('runs').withIndex('by_installation_job_attempt', (q) => q.eq('installationId', args.installationId).eq('jobId', job.jobId).eq('attempt', job.attempt)).unique()
      return { command: withoutSystemFields(command), job: job === null ? undefined : withoutSystemFields(job), run: run === null ? undefined : withoutSystemFields(run) }
    }))
    if (installation === null) throw new Error('installation not found')
    return {
      transactionRevision: installation.snapshotRevision ?? 0,
      productivity: { tasks: tasks.map(withoutSystemFields), reminders: reminders.map(withoutSystemFields), calendarEvents: calendarEvents.map(withoutSystemFields), notes: notes.map(withoutSystemFields), notificationIntents: notificationIntents.map(withoutSystemFields) },
      agents: { threads: threads.map(withoutSystemFields), messages: messages.map(withoutSystemFields) },
      knowledge: { sources: sources.map(withoutSystemFields), documents: knowledge.map(withoutSystemFields), artifacts: artifacts.filter((item) => item.deletedAt === undefined).map(withoutSystemFields) },
      nodes: { items: nodes.map(withoutSystemFields), activity },
    }
  },
})
