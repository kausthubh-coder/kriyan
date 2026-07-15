import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

import type {
  KnowledgeDocumentProjectionInput,
  KnowledgeProjectionPlane,
  SourceRefProjectionInput,
} from '@kriyan/convex-client'
import {
  FilesystemVault,
  KnowledgeIndex,
  SourceRegistry,
  TemporaryMaterializer,
  sha256,
  stableId,
  type EmbeddingProvider,
  type EntityMetadata,
  type EntityKind,
  type RegisterSourceInput,
  type SearchMode,
  type SearchResponse,
  type SourceRef,
} from '@kriyan/knowledge-vault'

const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
const MAX_SOURCE_TOTAL_BYTES = 10 * 1024 * 1024

async function sourceFiles(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.kriyan-materialization.json') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) output.push(...await sourceFiles(path))
    else if (entry.isFile()) output.push(path)
  }
  return output
}

async function optionalMarkdownFiles(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) output.push(...await optionalMarkdownFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(path)
  }
  return output
}

async function transcriptBody(root: string): Promise<string> {
  const sections: string[] = []
  let total = 0
  for (const path of (await sourceFiles(root)).sort()) {
    const info = await stat(path)
    if (info.size > MAX_SOURCE_FILE_BYTES) continue
    const bytes = await readFile(path)
    if (bytes.includes(0)) continue
    total += bytes.byteLength
    if (total > MAX_SOURCE_TOTAL_BYTES) throw new Error('source text exceeds the 10 MiB ingestion limit')
    const body = bytes.toString('utf8').trim()
    if (body.length > 0) sections.push(`## ${relative(root, path)}\n\n${body}`)
  }
  if (sections.length === 0) throw new Error('source contains no ingestible text files')
  return sections.join('\n\n')
}

function sourceProjectionKind(source: SourceRef): SourceRefProjectionInput['kind'] {
  if (source.kind === 'git' || source.kind === 'github') return 'git'
  if (source.kind === 'web') return 'web'
  return 'document'
}

export interface IngestKnowledgeInput {
  sourceRefId: string
  entityKind: EntityKind
  entitySlug: string
  title: string
  summary?: string
  tags?: string[]
}

export interface KnowledgeServiceOptions {
  vaultRoot: string
  workspaceRoot?: string
  embeddingProvider?: EmbeddingProvider
  projectionPlane?: KnowledgeProjectionPlane
  installationId?: string
}

export class KnowledgeService {
  readonly registry: SourceRegistry
  readonly vault: FilesystemVault
  readonly materializer: TemporaryMaterializer
  readonly index: KnowledgeIndex
  private readonly projections?: KnowledgeProjectionPlane
  private readonly installationId?: string

  constructor(options: KnowledgeServiceOptions) {
    this.registry = new SourceRegistry(options.vaultRoot)
    this.vault = new FilesystemVault(options.vaultRoot)
    this.materializer = new TemporaryMaterializer(options.workspaceRoot ?? join(options.vaultRoot, '.workspaces'))
    this.index = new KnowledgeIndex(this.vault, undefined, options.embeddingProvider)
    this.projections = options.projectionPlane
    this.installationId = options.installationId
    if ((this.projections === undefined) !== (this.installationId === undefined)) {
      throw new Error('projection plane and installation ID must be provided together')
    }
  }

  async initialize(): Promise<{ recoveredWrites: number; staleWorkspacesRemoved: number }> {
    const recoveredWrites = await this.vault.recover()
    const staleWorkspacesRemoved = await this.materializer.reconcileStaleWorkspaces()
    const indexExists = await stat(this.index.databasePath).then(() => true).catch(() => false)
    if (!indexExists) await this.index.rebuild()
    return { recoveredWrites, staleWorkspacesRemoved }
  }

  async registerSource(input: RegisterSourceInput): Promise<SourceRef> {
    return await this.registry.register(input)
  }

  async ingest(input: IngestKnowledgeInput): Promise<{
    source: SourceRef
    sourceVersion: string
    transcriptPath: string
    entityPath: string
    entityId: string
    index: { documents: number; embeddings: number }
  }> {
    const source = await this.registry.get(input.sourceRefId)
    if (source === null) throw new Error(`source not found: ${input.sourceRefId}`)
    return await this.materializer.withMaterializedSource(source, async (materialized) => {
      const body = await transcriptBody(materialized.path)
      const sourceVersion = materialized.sourceVersion === 'local-working-copy'
        ? `sha256:${sha256(body)}`
        : materialized.sourceVersion
      const transcript = await this.vault.writeTranscript(source, sourceVersion, body)
      const summary = input.summary?.trim() || input.title.trim()
      const entity = await this.vault.writeEntity({
        kind: input.entityKind,
        slug: input.entitySlug,
        title: input.title,
        summary,
        tags: input.tags,
        body: `${summary}\n\n## Source material\n\n${body}`,
        citations: [transcript.citation],
      })
      const index = await this.index.rebuild()
      await this.syncProjections(source, transcript.metadata.contentHash, entity.metadata)
      return {
        source,
        sourceVersion,
        transcriptPath: transcript.relativePath,
        entityPath: entity.relativePath,
        entityId: entity.metadata.entityId,
        index,
      }
    })
  }

  async rebuildIndex(): Promise<{ documents: number; embeddings: number }> {
    return await this.index.rebuild()
  }

  async search(query: string, mode: SearchMode = 'lexical', limit = 10): Promise<SearchResponse> {
    return await this.index.search(query, { mode, limit })
  }

  async assembleCitedContext(query: string, limit = 8): Promise<string> {
    const response = await this.search(query, 'lexical', limit)
    const sections = response.results.map((result) => {
      const citations = result.citations.map((citation) => citation.citationId).join(', ')
      return `[${citations}] ${result.title}\n${result.excerpt}`
    })
    const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 16) ?? []
    const artifacts = await optionalMarkdownFiles(join(this.vault.root, 'artifacts'))
    const ranked: Array<{ score: number; section: string }> = []
    for (const path of artifacts.slice(0, 512)) {
      const info = await stat(path)
      if (info.size > 2 * 1024 * 1024) continue
      const content = await readFile(path, 'utf8')
      const lower = content.toLocaleLowerCase()
      const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0)
      if (score === 0) continue
      const metadataLine = content.match(/^---\n([^\n]+)\n---/)?.[1]
      let metadata: { noteVersionId?: string; artifactId?: string } = {}
      try {
        if (metadataLine !== undefined) metadata = JSON.parse(metadataLine) as typeof metadata
      } catch {
        continue
      }
      const citation = metadata.noteVersionId ?? metadata.artifactId ?? relative(this.vault.root, path)
      ranked.push({
        score,
        section: `[${citation}] ${relative(this.vault.root, path)}\n${content.replace(/^---[\s\S]*?---\n+/, '').replace(/\s+/g, ' ').trim().slice(0, 480)}`,
      })
    }
    sections.push(...ranked.sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, limit - sections.length)).map((entry) => entry.section))
    return sections.join('\n\n')
  }

  private async syncProjections(
    source: SourceRef,
    contentHash: string,
    entity: EntityMetadata,
  ): Promise<void> {
    if (this.projections === undefined || this.installationId === undefined) return
    const sourceProjection: SourceRefProjectionInput = {
      installationId: this.installationId,
      sourceRefId: source.sourceRefId,
      idempotencyKey: stableId('projection', source.sourceRefId),
      kind: sourceProjectionKind(source),
      displayName: source.displayName,
      sourceUrl: ['web', 'github'].includes(source.kind) ? source.location : undefined,
      externalId: source.sourceRefId,
      contentHash,
      syncState: 'synced',
      indexState: 'indexed',
      provenanceIds: entity.provenanceIds,
    }
    const sourceResult = await this.projections.upsertSourceRef(sourceProjection)
    if (!sourceResult.ok) throw new Error(`source projection rejected: ${sourceResult.reason}`)
    const knowledgeProjection: KnowledgeDocumentProjectionInput = {
      installationId: this.installationId,
      knowledgeDocumentId: entity.entityId,
      idempotencyKey: stableId('projection', entity.entityId),
      kind: entity.entityKind,
      title: entity.title,
      summary: entity.summary,
      tags: entity.tags,
      sourceRefIds: entity.sourceRefIds,
      provenanceIds: entity.provenanceIds,
      syncState: 'synced',
      indexState: 'indexed',
    }
    const entityResult = await this.projections.upsertKnowledgeDocument(knowledgeProjection)
    if (!entityResult.ok) throw new Error(`knowledge projection rejected: ${entityResult.reason}`)
  }
}
