import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import type { Id, TableNames } from './_generated/dataModel'
import { assertId, assertPositiveInteger, assertShortText } from './lib'

const cleanupTables = [
  'runEvents',
  'runs',
  'jobs',
  'commands',
  'tasks',
  'reminders',
  'nodes',
  'installations',
] as const

const cleanupTable = v.union(
  v.literal('runEvents'),
  v.literal('runs'),
  v.literal('jobs'),
  v.literal('commands'),
  v.literal('tasks'),
  v.literal('reminders'),
  v.literal('nodes'),
  v.literal('installations'),
)

type CleanupTable = (typeof cleanupTables)[number]

function assertIsolatedDevelopmentDeployment(deploymentName: string): void {
  assertShortText(deploymentName, 'deploymentName')
  const configuredDeployment = process.env.KRIYAN_DEV_DEPLOYMENT
  if (
    configuredDeployment === undefined ||
    configuredDeployment !== deploymentName
  ) {
    throw new Error(
      'development fixture tooling is disabled for this deployment',
    )
  }
}

export const seed = internalMutation({
  args: {
    deploymentName: v.string(),
    installationId: v.string(),
  },
  returns: v.object({ created: v.boolean(), installationId: v.string() }),
  handler: async (ctx, args) => {
    assertIsolatedDevelopmentDeployment(args.deploymentName)
    assertId(args.installationId, 'installationId')
    const now = Date.now()
    const existing = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()
    if (existing !== null) {
      return { created: false, installationId: existing.installationId }
    }
    await ctx.db.insert('installations', {
      installationId: args.installationId,
      timezone: 'UTC',
      protocolVersion: '1',
      createdAt: now,
      updatedAt: now,
    })
    return { created: true, installationId: args.installationId }
  },
})

export const resetInstallation = internalMutation({
  args: {
    deploymentName: v.string(),
    installationId: v.string(),
    confirmation: v.literal('RESET_KRIYAN_DEV'),
    batchSize: v.number(),
  },
  returns: v.object({
    deleted: v.number(),
    processedTable: v.union(v.null(), cleanupTable),
    nextTable: v.union(v.null(), cleanupTable),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertIsolatedDevelopmentDeployment(args.deploymentName)
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(args.batchSize, 'batchSize', 64)

    for (let index = 0; index < cleanupTables.length; index += 1) {
      const tableName = cleanupTables[index]!
      let documentIds: Array<Id<TableNames>>
      switch (tableName) {
        case 'runEvents':
          documentIds = (
            await ctx.db
              .query('runEvents')
              .withIndex('by_installation_event', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'runs':
          documentIds = (
            await ctx.db
              .query('runs')
              .withIndex('by_installation_status', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'jobs':
          documentIds = (
            await ctx.db
              .query('jobs')
              .withIndex('by_installation_job', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'commands':
          documentIds = (
            await ctx.db
              .query('commands')
              .withIndex('by_installation_command', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'tasks':
          documentIds = (
            await ctx.db
              .query('tasks')
              .withIndex('by_installation_task', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'reminders':
          documentIds = (
            await ctx.db
              .query('reminders')
              .withIndex('by_installation_reminder', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'nodes':
          documentIds = (
            await ctx.db
              .query('nodes')
              .withIndex('by_installation_node', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
        case 'installations':
          documentIds = (
            await ctx.db
              .query('installations')
              .withIndex('by_installation_id', (q) =>
                q.eq('installationId', args.installationId),
              )
              .take(args.batchSize + 1)
          ).map((document) => document._id)
          break
      }
      if (documentIds.length === 0) continue

      const batch = documentIds.slice(0, args.batchSize)
      for (const documentId of batch) {
        await ctx.db.delete(documentId)
      }
      const hasMoreInTable = documentIds.length > args.batchSize
      const nextTable: CleanupTable | null = hasMoreInTable
        ? tableName
        : (cleanupTables[index + 1] ?? null)
      const done = tableName === 'installations' && !hasMoreInTable
      return {
        deleted: batch.length,
        processedTable: tableName,
        nextTable,
        done,
      }
    }
    return {
      deleted: 0,
      processedTable: null,
      nextTable: null,
      done: true,
    }
  },
})
