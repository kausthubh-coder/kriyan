import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import { assertId, assertShortText, assertTimestamp } from './lib'

const tableNames = [
  'runEvents',
  'runs',
  'jobs',
  'commands',
  'tasks',
  'reminders',
  'nodes',
  'installations',
] as const

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
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), installationId: v.string() }),
  handler: async (ctx, args) => {
    assertIsolatedDevelopmentDeployment(args.deploymentName)
    assertId(args.installationId, 'installationId')
    assertTimestamp(args.now, 'now')
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
      createdAt: args.now,
      updatedAt: args.now,
    })
    return { created: true, installationId: args.installationId }
  },
})

export const resetInstallation = internalMutation({
  args: {
    deploymentName: v.string(),
    installationId: v.string(),
    confirmation: v.literal('RESET_KRIYAN_DEV'),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    assertIsolatedDevelopmentDeployment(args.deploymentName)
    assertId(args.installationId, 'installationId')
    let deleted = 0
    for (const tableName of tableNames) {
      const documents = await ctx.db.query(tableName).collect()
      for (const document of documents) {
        if (document.installationId === args.installationId) {
          await ctx.db.delete(document._id)
          deleted += 1
        }
      }
    }
    return { deleted }
  },
})
