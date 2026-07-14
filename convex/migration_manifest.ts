import { v } from 'convex/values'
import { canonicalContentHash, canonicalJson } from '@kriyan/contracts'

import type { MutationCtx, QueryCtx } from './_generated/server'

export const migrationTableNames = [
  'installations', 'nodes', 'commands', 'jobs', 'runs', 'runEvents',
  'workerEffectReceipts', 'tasks', 'reminders', 'calendarEvents',
  'notificationIntents', 'notes', 'noteVersions', 'artifacts', 'noteLinks',
  'agents', 'agentRevisions', 'agentThreads', 'agentMessages', 'sourceRefs',
  'knowledgeDocuments', 'knowledgeRelations', 'provenanceLinks',
  'projectionCursors', 'memoryCorrections',
] as const

export const migrationManifestValue = v.object({
  version: v.literal(1),
  installationId: v.string(),
  aggregateHash: v.string(),
  tables: v.array(v.object({ table: v.string(), count: v.number(), hash: v.string() })),
})

export interface MigrationManifest {
  version: 1
  installationId: string
  aggregateHash: string
  tables: Array<{ table: string; count: number; hash: string }>
}

function portableRow(row: Record<string, unknown>): Record<string, unknown> {
  const { _id: _id, _creationTime: _creationTime, ...portable } = row
  return portable
}

export async function computeMigrationManifest(
  ctx: QueryCtx | MutationCtx,
  installationId: string,
): Promise<MigrationManifest> {
  const tables: MigrationManifest['tables'] = []
  for (const table of migrationTableNames) {
    const rows = await ctx.db
      .query(table)
      .filter((q) => q.eq(q.field('installationId'), installationId))
      .collect()
    const stableRows = rows
      .map((row) => portableRow(row as unknown as Record<string, unknown>))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
    tables.push({
      table,
      count: stableRows.length,
      hash: canonicalContentHash(JSON.stringify(stableRows)),
    })
  }
  return {
    version: 1,
    installationId,
    aggregateHash: canonicalContentHash(JSON.stringify({ version: 1, installationId, tables })),
    tables,
  }
}
