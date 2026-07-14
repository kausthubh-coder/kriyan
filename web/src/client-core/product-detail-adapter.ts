/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AppNoteItem,
  ArtifactItem,
  MemoryCorrectionItem,
  NoteHistoryItem,
  NoteVersionItem,
  ProductDetailRepository,
  ProductMutationResult,
  ReversibleChangeItem,
  SourceDetailItem,
  TaskProvenanceDetailItem,
} from '@kriyan/client-core'

import { api } from '@convex/_generated/api'

interface DetailTransport {
  query(reference: any, args: any): Promise<any>
  mutation(reference: any, args: any): Promise<any>
}

function failure<T>(reason: string): ProductMutationResult<T> {
  return { ok: false, reason: reason as any, message: `Convex rejected the detail operation: ${reason}.` }
}

function stripInstallation<T>(value: any): T {
  const portable = { ...value }
  delete portable.installationId
  return portable as T
}

function artifactDetail(value: any): ArtifactItem {
  return {
    ...stripInstallation<ArtifactItem>(value.artifact),
    history: value.history.map((item: any) => {
      const history = { ...item }
      delete history.installationId
      delete history.historyId
      delete history.artifactId
      return history
    }),
  }
}

function correctionResult(created: boolean, correction: any): ProductMutationResult<MemoryCorrectionItem> {
  const value = stripInstallation<MemoryCorrectionItem>(correction)
  return { ok: true, created, revision: value.appliedRevision ?? value.expectedRevision, value }
}

function sourceDetail(value: any): SourceDetailItem | null {
  return value ? { ...value, source: stripInstallation(value.source) } as SourceDetailItem : null
}

function taskProvenanceDetail(value: any): TaskProvenanceDetailItem | null {
  return value ? {
    ...value,
    task: stripInstallation(value.task),
    sources: value.sources.map((item: any) => stripInstallation(item)),
  } as TaskProvenanceDetailItem : null
}

export function createWebProductDetailRepository(
  client: DetailTransport,
  installationId: string,
): ProductDetailRepository {
  return {
    noteDetailsV1: {
      async getHistory(noteId, limit = 50) {
        const value = await client.query(api.notes.getHistory, { installationId, noteId, limit })
        if (!value) return null
        return {
          note: stripInstallation<AppNoteItem>(value.note),
          versions: value.versions.map((item: any) => stripInstallation<NoteVersionItem>(item)),
          links: value.links.map((item: any) => stripInstallation(item)),
        } as NoteHistoryItem
      },
      async getVersion(noteVersionId) {
        const value = await client.query(api.notes.getVersion, { installationId, noteVersionId })
        return value ? stripInstallation<NoteVersionItem>(value) : null
      },
      async createLink(input) {
        const result = await client.mutation(api.notes.createLink, { installationId, ...input })
        const value = stripInstallation<NoteHistoryItem['links'][number]>(result.link)
        return { ok: true, created: result.created, revision: value.revision, value }
      },
      async tombstoneLink(noteLinkId, expectedRevision) {
        const result = await client.mutation(api.notes.tombstoneLink, { installationId, noteLinkId, expectedRevision })
        if (!result.ok) return failure(result.reason)
        const value = await client.query(api.notes.getLink, { installationId, noteLinkId })
        return value ? { ok: true, created: false, revision: result.revision, value: stripInstallation(value) } : failure('not_found')
      },
    },
    artifactsV1: {
      async get(artifactId) {
        const value = await client.query(api.notes.getArtifact, { installationId, artifactId, historyLimit: 100, includeDeleted: true })
        return value ? artifactDetail(value) : null
      },
      async listByNote(noteId, includeDeleted = false) {
        return (await client.query(api.notes.listArtifactsByNote, { installationId, noteId, includeDeleted, limit: 100 })).map(artifactDetail)
      },
      async create(input) {
        const result = await client.mutation(api.notes.createArtifact, { installationId, ...input })
        const value = stripInstallation<ArtifactItem>(result.artifact)
        return { ok: true, created: result.created, revision: value.revision, value }
      },
      async advance(input) {
        const result = await client.mutation(api.notes.advanceArtifact, { installationId, ...input })
        if (!result.ok) return failure(result.reason)
        const value = await client.query(api.notes.getArtifact, { installationId, artifactId: input.artifactId, historyLimit: 100, includeDeleted: true })
        return value ? { ok: true, created: false, revision: result.revision, value: artifactDetail(value) } : failure('not_found')
      },
      async tombstone(artifactId, expectedRevision) {
        const current = await client.query(api.notes.getArtifact, { installationId, artifactId, historyLimit: 1, includeDeleted: true })
        if (!current) return failure('not_found')
        const result = await client.mutation(api.notes.tombstoneMaterialization, { installationId, artifactId, noteVersionId: current.artifact.noteVersionId, expectedRevision, expectedProjectedHash: current.artifact.projectedHash })
        if (!result.ok) return failure(result.reason)
        const value = await client.query(api.notes.getArtifact, { installationId, artifactId, historyLimit: 100, includeDeleted: true })
        return value ? { ok: true, created: false, revision: result.revision, value: artifactDetail(value) } : failure('not_found')
      },
    },
    sourceDetailsV1: {
      getDetail: async (sourceRefId, limits = {}) => sourceDetail(await client.query(api.knowledge.getSourceDetail, { installationId, sourceRefId, excerpts: limits.excerpts ?? 50, extractions: limits.extractions ?? 50, derivedChanges: limits.derivedChanges ?? 50 })),
      listDerivedChanges: async (sourceRefId, limit = 50) => await client.query(api.knowledge.listDerivedChanges, { installationId, sourceRefId, limit }) as ReversibleChangeItem[],
    },
    memoryV1: {
      getEntity: async (entityId, limit = 50) => await client.query(api.knowledge.getMemoryEntity, { installationId, entityId, limit }),
      async createCorrection(input) {
        const result = await client.mutation(api.knowledge.createCorrection, { installationId, ...input })
        return correctionResult(result.created, result.correction)
      },
      async applyCorrection(correctionId, expectedRevision) {
        const result = await client.mutation(api.knowledge.applyCorrection, { installationId, correctionId, appliedRevision: expectedRevision })
        if (!result.ok) return failure(result.reason)
        const value = await client.query(api.knowledge.getCorrection, { installationId, correctionId })
        return value ? correctionResult(false, value) : failure('not_found')
      },
      async restoreCorrection(correctionId, expectedRevision) {
        const result = await client.mutation(api.knowledge.restoreCorrection, { installationId, correctionId, appliedRevision: expectedRevision })
        if (!result.ok) return failure(result.reason)
        const value = await client.query(api.knowledge.getCorrection, { installationId, correctionId })
        return value ? correctionResult(false, value) : failure('not_found')
      },
    },
    taskProvenanceV1: {
      getDetail: async (taskId) => taskProvenanceDetail(await client.query(api.knowledge.getTaskProvenance, { installationId, taskId, limit: 100 })),
      listChanges: async (taskId, limit = 50) => await client.query(api.knowledge.listTaskChanges, { installationId, taskId, limit }) as ReversibleChangeItem[],
      async revertChange(changeId, expectedRevision) {
        const result = await client.mutation(api.knowledge.revertChange, { installationId, changeId, expectedRevision })
        return result.ok ? { ok: true, created: false, revision: result.change.afterRevision + 1, value: result.change as ReversibleChangeItem } : failure(result.reason)
      },
    },
  }
}
