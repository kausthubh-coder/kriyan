import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import { AtomicFileStore } from './atomic-store'
import { canonicalJson, safeSlug, sha256, stableId } from './ids'
import type {
  CitationMetadata,
  EntityKind,
  EntityMetadata,
  SourceRef,
  TranscriptMetadata,
  VaultDocument,
  VaultDocumentMetadata,
  WriteResult,
} from './types'

function markdown(metadata: VaultDocumentMetadata, body: string): string {
  return `---\n${canonicalJson(metadata)}\n---\n\n${body.trim()}\n`
}

export function parseVaultMarkdown(content: string): { metadata: VaultDocumentMetadata; body: string } {
  const match = content.match(/^---\n([^\n]+)\n---\n\n([\s\S]*)$/)
  if (match?.[1] === undefined || match[2] === undefined) throw new Error('invalid vault Markdown')
  const metadata = JSON.parse(match[1]) as VaultDocumentMetadata
  if (metadata.schemaVersion !== 1 || !['transcript', 'entity'].includes(metadata.documentType)) {
    throw new Error('unsupported vault document')
  }
  return { metadata, body: match[2].replace(/\n$/, '') }
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) output.push(...await walk(path))
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(path)
  }
  return output
}

export interface WriteEntityInput {
  kind: EntityKind
  slug: string
  title: string
  summary: string
  tags?: string[]
  body: string
  citations: CitationMetadata[]
  expectedHash?: string | null
}

export class FilesystemVault {
  readonly root: string
  readonly store: AtomicFileStore

  constructor(root: string) {
    this.root = resolve(root)
    this.store = new AtomicFileStore(root)
  }

  async recover(): Promise<number> {
    return await this.store.recover()
  }

  async writeTranscript(source: SourceRef, sourceVersion: string, body: string): Promise<WriteResult & { metadata: TranscriptMetadata; citation: CitationMetadata }> {
    const contentHash = sha256(body)
    const transcriptId = stableId('transcript', source.sourceRefId, sourceVersion, contentHash)
    const relativePath = `transcripts/${transcriptId.replace(':', '-')}.md`
    const citationId = stableId('citation', source.sourceRefId, sourceVersion, contentHash)
    const metadata: TranscriptMetadata = {
      schemaVersion: 1,
      documentType: 'transcript',
      transcriptId,
      title: source.displayName,
      sourceRefId: source.sourceRefId,
      sourceVersion,
      sourceLocation: source.location,
      contentHash,
      citationId,
    }
    const fileHash = await this.store.write(relativePath, markdown(metadata, body))
    const citation: CitationMetadata = {
      citationId,
      sourceRefId: source.sourceRefId,
      sourceVersion,
      sourceLocation: source.location,
      vaultPath: relativePath,
      contentHash,
    }
    return { relativePath, fileHash, metadata, citation }
  }

  async writeEntity(input: WriteEntityInput): Promise<WriteResult & { metadata: EntityMetadata }> {
    const slug = safeSlug(input.slug)
    const kindFolder = `${input.kind}s`
    const relativePath = `entities/${kindFolder}/${slug}.md`
    const title = input.title.trim()
    const summary = input.summary.trim()
    if (title.length === 0) throw new Error('entity title is required')
    const citations = [...input.citations].sort((left, right) => left.citationId.localeCompare(right.citationId))
    const sourceRefIds = [...new Set(citations.map((entry) => entry.sourceRefId))].sort()
    const provenanceIds = [...new Set(citations.map((entry) => entry.citationId))].sort()
    const metadata: EntityMetadata = {
      schemaVersion: 1,
      documentType: 'entity',
      entityId: stableId('entity', input.kind, slug),
      entityKind: input.kind,
      slug,
      title,
      summary,
      tags: [...new Set(input.tags ?? [])].map((tag) => tag.trim()).filter(Boolean).sort(),
      sourceRefIds,
      provenanceIds,
      citations,
      contentHash: sha256(input.body),
    }
    const fileHash = await this.store.write(relativePath, markdown(metadata, input.body), input.expectedHash)
    return { relativePath, fileHash, metadata }
  }

  async readDocument(relativePath: string): Promise<VaultDocument> {
    const content = await readFile(this.store.resolvePath(relativePath), 'utf8')
    const parsed = parseVaultMarkdown(content)
    return { relativePath, ...parsed, fileHash: sha256(content) }
  }

  async listDocuments(): Promise<VaultDocument[]> {
    const roots = [join(this.root, 'transcripts'), join(this.root, 'entities')]
    const paths = (await Promise.all(roots.map(walk))).flat().sort()
    return await Promise.all(paths.map(async (path) => await this.readDocument(relative(this.root, path))))
  }

  async resolveCitation(citation: CitationMetadata): Promise<VaultDocument> {
    const document = await this.readDocument(citation.vaultPath)
    if (document.metadata.documentType !== 'transcript') throw new Error('citation does not target a transcript')
    if (
      document.metadata.citationId !== citation.citationId ||
      document.metadata.sourceRefId !== citation.sourceRefId ||
      document.metadata.sourceVersion !== citation.sourceVersion ||
      document.metadata.contentHash !== citation.contentHash ||
      sha256(document.body) !== citation.contentHash
    ) {
      throw new Error('citation provenance no longer resolves')
    }
    return document
  }
}
