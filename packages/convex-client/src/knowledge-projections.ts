import type { ConvexClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

export type SourceRefKind =
  | 'audio'
  | 'video'
  | 'document'
  | 'web'
  | 'git'
  | 'calendar'
  | 'email'
  | 'chat'
  | 'other'

export type KnowledgeDocumentKind =
  | 'person'
  | 'project'
  | 'topic'
  | 'organization'
  | 'place'
  | 'event'
  | 'other'

export type ProjectionSyncState = 'pending' | 'synced' | 'failed' | 'stale'
export type ProjectionIndexState = 'pending' | 'indexed' | 'failed' | 'stale'

export type SourceRefProjectionInput = {
  installationId: string
  sourceRefId: string
  idempotencyKey: string
  kind: SourceRefKind
  displayName: string
  sourceUrl?: string
  externalId?: string
  contentHash?: string
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  provenanceIds: string[]
  lastSyncedAt?: number
  expectedRevision?: number
}

export type KnowledgeDocumentProjectionInput = {
  installationId: string
  knowledgeDocumentId: string
  idempotencyKey: string
  kind: KnowledgeDocumentKind
  title: string
  summary: string
  tags: string[]
  sourceRefIds: string[]
  provenanceIds: string[]
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  expectedRevision?: number
}

export type ProjectionUpsertResult =
  | { ok: true; created: boolean; revision: number }
  | {
      ok: false
      reason: 'not_found' | 'stale_revision' | 'invalid_state'
    }

export interface KnowledgeProjectionPlane {
  upsertSourceRef(
    input: SourceRefProjectionInput,
  ): Promise<ProjectionUpsertResult>
  upsertKnowledgeDocument(
    input: KnowledgeDocumentProjectionInput,
  ): Promise<ProjectionUpsertResult>
}

type KnowledgeMutationClient = Pick<ConvexClient, 'mutation'>

export const knowledgeProjectionMutationReferences = {
  upsertSourceRef: makeFunctionReference<
    'mutation',
    SourceRefProjectionInput,
    ProjectionUpsertResult
  >('knowledge:upsertSourceRef'),
  upsertKnowledgeDocument: makeFunctionReference<
    'mutation',
    KnowledgeDocumentProjectionInput,
    ProjectionUpsertResult
  >('knowledge:upsertKnowledgeDocument'),
} as const

export function createKnowledgeProjectionPlane(
  client: KnowledgeMutationClient,
): KnowledgeProjectionPlane {
  return {
    async upsertSourceRef(input): Promise<ProjectionUpsertResult> {
      return await client.mutation(
        knowledgeProjectionMutationReferences.upsertSourceRef,
        input,
      )
    },
    async upsertKnowledgeDocument(input): Promise<ProjectionUpsertResult> {
      return await client.mutation(
        knowledgeProjectionMutationReferences.upsertKnowledgeDocument,
        input,
      )
    },
  }
}
