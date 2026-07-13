import { v } from 'convex/values'

import { query } from './_generated/server'
import { assertId, withoutSystemFields } from './lib'
import {
  jobValue,
  nodeValue,
  reminderValue,
  runEventValue,
  runValue,
  taskValue,
} from './validators'

export const nodes = query({
  args: { installationId: v.string() },
  returns: v.array(nodeValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const values = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    return values.map(withoutSystemFields)
  },
})

export const jobs = query({
  args: { installationId: v.string() },
  returns: v.array(jobValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const values = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    return values.map(withoutSystemFields)
  },
})

export const runs = query({
  args: { installationId: v.string(), jobId: v.optional(v.string()) },
  returns: v.array(runValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.jobId !== undefined) assertId(args.jobId, 'jobId')
    const values = args.jobId
      ? await ctx.db
          .query('runs')
          .withIndex('by_installation_job_attempt', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('jobId', args.jobId as string),
          )
          .collect()
      : await ctx.db
          .query('runs')
          .withIndex('by_installation_run', (q) =>
            q.eq('installationId', args.installationId),
          )
          .collect()
    return values.map(withoutSystemFields)
  },
})

export const runEvents = query({
  args: { installationId: v.string(), runId: v.string() },
  returns: v.array(runEventValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.runId, 'runId')
    const values = await ctx.db
      .query('runEvents')
      .withIndex('by_installation_run_sequence', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .collect()
    return values.map(withoutSystemFields)
  },
})

export const tasks = query({
  args: { installationId: v.string() },
  returns: v.array(taskValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const values = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    return values.map(withoutSystemFields)
  },
})

export const reminders = query({
  args: { installationId: v.string() },
  returns: v.array(reminderValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const values = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    return values.map(withoutSystemFields)
  },
})
