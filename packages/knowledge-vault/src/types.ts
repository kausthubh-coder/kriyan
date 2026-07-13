export type SourceKind = 'git' | 'github' | 'drive' | 'local' | 'web'
export type EntityKind = 'person' | 'project' | 'topic'

export interface SourceRef {
  schemaVersion: 1
  sourceRefId: string
  kind: SourceKind
  displayName: string
  location: string
  sourceVersion?: string
}

export interface RegisterSourceInput {
  kind: SourceKind
  displayName: string
  location: string
  sourceVersion?: string
}

export interface CitationMetadata {
  citationId: string
  sourceRefId: string
  sourceVersion: string
  sourceLocation: string
  vaultPath: string
  contentHash: string
}

export interface TranscriptMetadata {
  schemaVersion: 1
  documentType: 'transcript'
  transcriptId: string
  title: string
  sourceRefId: string
  sourceVersion: string
  sourceLocation: string
  contentHash: string
  citationId: string
}

export interface EntityMetadata {
  schemaVersion: 1
  documentType: 'entity'
  entityId: string
  entityKind: EntityKind
  slug: string
  title: string
  summary: string
  tags: string[]
  sourceRefIds: string[]
  provenanceIds: string[]
  citations: CitationMetadata[]
  contentHash: string
}

export type VaultDocumentMetadata = TranscriptMetadata | EntityMetadata

export interface VaultDocument {
  relativePath: string
  metadata: VaultDocumentMetadata
  body: string
  fileHash: string
}

export interface WriteResult {
  relativePath: string
  fileHash: string
}

export interface EmbeddingProvider {
  readonly name: string
  embed(text: string, signal?: AbortSignal): Promise<Float32Array>
}

export type SearchMode = 'lexical' | 'hybrid'

export interface SearchResult {
  documentId: string
  relativePath: string
  documentType: 'transcript' | 'entity'
  title: string
  excerpt: string
  score: number
  retrieval: 'lexical' | 'hybrid' | 'lexical-fallback'
  citations: CitationMetadata[]
}

export interface SearchResponse {
  query: string
  requestedMode: SearchMode
  effectiveMode: 'lexical' | 'hybrid' | 'lexical-fallback'
  results: SearchResult[]
}
