import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { assertId, assertShortText, withoutSystemFields } from './lib'
import { installationValue } from './validators'

export const create = mutation({
  args: {
    installationId: v.string(),
    timezone: v.string(),
    protocolVersion: v.string(),
  },
  returns: v.object({
    created: v.boolean(),
    installation: installationValue,
  }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertShortText(args.timezone, 'timezone')
    assertShortText(args.protocolVersion, 'protocolVersion')
    const now = Date.now()

    const existing = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()

    if (existing !== null) {
      if (
        existing.timezone !== args.timezone ||
        existing.protocolVersion !== args.protocolVersion
      ) {
        throw new Error('installationId already exists with different settings')
      }
      return { created: false, installation: withoutSystemFields(existing) }
    }

    const id = await ctx.db.insert('installations', {
      installationId: args.installationId,
      timezone: args.timezone,
      protocolVersion: args.protocolVersion,
      createdAt: now,
      updatedAt: now,
    })
    const installation = await ctx.db.get(id)
    if (installation === null) {
      throw new Error('installation insert did not persist')
    }
    return { created: true, installation: withoutSystemFields(installation) }
  },
})

export const get = query({
  args: { installationId: v.string() },
  returns: v.union(v.null(), installationValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const installation = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()
    return installation === null ? null : withoutSystemFields(installation)
  },
})
