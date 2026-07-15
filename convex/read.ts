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

export const agentRunEvents = query({
  args: {
    installationId: v.string(),
    runIds: v.array(v.string()),
  },
  returns: v.object({
    items: v.array(runEventValue),
    queriedRunIds: v.array(v.string()),
    runIdLimit: v.number(),
    truncatedRunIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const runIdLimit = 20
    if (args.runIds.length > runIdLimit) {
      throw new Error(`runIds must contain at most ${runIdLimit} values`)
    }
    if (new Set(args.runIds).size !== args.runIds.length) throw new Error('runIds must not contain duplicates')
    for (const runId of args.runIds) assertId(runId, 'runId')
    const pages = await Promise.all(args.runIds.map(async (runId) => {
      const events = await ctx.db
        .query('runEvents')
        .withIndex('by_installation_run_sequence', (q) => q
          .eq('installationId', args.installationId)
          .eq('runId', runId))
        .order('desc')
        .take(51)
      return {
        items: events.slice(0, 50).reverse().map(withoutSystemFields),
        truncated: events.length > 50,
        runId,
      }
    }))
    return {
      items: pages.flatMap((page) => page.items),
      queriedRunIds: args.runIds,
      runIdLimit,
      truncatedRunIds: pages.filter((page) => page.truncated).map((page) => page.runId),
    }
  },
})

export const clientSnapshot = query({
  args: { installationId: v.string() },
  returns: clientSnapshotValue,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const limit = 100
    const [installation, tasks, reminders, calendarEvents, notes, notificationIntents, sources, knowledge, nodes, commands, threads, messages, artifacts] = await Promise.all([
      ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique(),
      ctx.db.query('tasks').withIndex('by_installation_live_task', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('reminders').withIndex('by_installation_live_reminder', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('calendarEvents').withIndex('by_installation_live_start', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('notes').withIndex('by_installation_live_updated', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('notificationIntents').withIndex('by_installation_live_schedule', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('sourceRefs').withIndex('by_installation_live_kind', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('knowledgeDocuments').withIndex('by_installation_live_kind', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
      ctx.db.query('nodes').withIndex('by_installation_node', (q) => q.eq('installationId', args.installationId)).take(limit + 1),
      ctx.db.query('commands').withIndex('by_installation_created', (q) => q.eq('installationId', args.installationId)).order('desc').take(limit + 1),
      ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId)).take(limit + 1),
      ctx.db.query('agentMessages').withIndex('by_installation_message', (q) => q.eq('installationId', args.installationId)).take(limit + 1),
      ctx.db.query('artifacts').withIndex('by_installation_live_artifact', (q) => q.eq('installationId', args.installationId).eq('deletedAt', undefined)).take(limit + 1),
    ])
    const boundedCommands = commands.slice(0, limit)
    const activity = await Promise.all(boundedCommands.map(async (command) => {
      const job = await ctx.db.query('jobs').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', command.commandId)).unique()
      const run = job === null || job.attempt === 0 ? null : await ctx.db.query('runs').withIndex('by_installation_job_attempt', (q) => q.eq('installationId', args.installationId).eq('jobId', job.jobId).eq('attempt', job.attempt)).unique()
      return { command: withoutSystemFields(command), job: job === null ? undefined : withoutSystemFields(job), run: run === null ? undefined : withoutSystemFields(run) }
    }))
    if (installation === null) throw new Error('installation not found')
    const window = (rows: readonly unknown[]) => ({ limit, returned: Math.min(rows.length, limit), truncated: rows.length > limit })
    return {
      transactionRevision: installation.snapshotRevision ?? 0,
      windows: {
        tasks: window(tasks), reminders: window(reminders), calendarEvents: window(calendarEvents), notes: window(notes),
        notificationIntents: window(notificationIntents), sources: window(sources), documents: window(knowledge),
        artifacts: window(artifacts), nodes: window(nodes), threads: window(threads), messages: window(messages), activity: window(commands),
      },
      productivity: { tasks: tasks.slice(0, limit).map(withoutSystemFields), reminders: reminders.slice(0, limit).map(withoutSystemFields), calendarEvents: calendarEvents.slice(0, limit).map(withoutSystemFields), notes: notes.slice(0, limit).map(withoutSystemFields), notificationIntents: notificationIntents.slice(0, limit).map(withoutSystemFields) },
      agents: { threads: threads.slice(0, limit).map(withoutSystemFields), messages: messages.slice(0, limit).map(withoutSystemFields) },
      knowledge: { sources: sources.slice(0, limit).map(withoutSystemFields), documents: knowledge.slice(0, limit).map(withoutSystemFields), artifacts: artifacts.slice(0, limit).map(withoutSystemFields) },
      nodes: { items: nodes.slice(0, limit).map(withoutSystemFields), activity },
    }
  },
})
