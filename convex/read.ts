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
  jobStatus,
  jobValue,
  nodeValue,
  runEventValue,
  runValue,
} from './validators'

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
