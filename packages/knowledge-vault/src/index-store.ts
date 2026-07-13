import { mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import { canonicalJson } from './ids'
import type {
  CitationMetadata,
  EmbeddingProvider,
  SearchMode,
  SearchResponse,
  SearchResult,
  VaultDocument,
} from './types'
import type { FilesystemVault } from './vault'

interface StoredDocument {
  documentId: string
  relativePath: string
  documentType: 'transcript' | 'entity'
  title: string
  body: string
  citations: CitationMetadata[]
  embedding: Float32Array | null
}

interface SearchRow {
  document_id: string
  relative_path: string
  document_type: 'transcript' | 'entity'
  title: string
  body: string
  citations: string
  embedding: Uint8Array | null
  embedding_dimensions: number | null
  rank?: number
}

function documentId(document: VaultDocument): string {
  return document.metadata.documentType === 'transcript'
    ? document.metadata.transcriptId
    : document.metadata.entityId
}

function citations(document: VaultDocument): CitationMetadata[] {
  if (document.metadata.documentType === 'entity') return document.metadata.citations
  return [{
    citationId: document.metadata.citationId,
    sourceRefId: document.metadata.sourceRefId,
    sourceVersion: document.metadata.sourceVersion,
    sourceLocation: document.metadata.sourceLocation,
    vaultPath: document.relativePath,
    contentHash: document.metadata.contentHash,
  }]
}

function title(document: VaultDocument): string {
  return document.metadata.title
}

function encodeVector(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength))
}

function decodeVector(bytes: Uint8Array, dimensions: number): Float32Array {
  const copy = Uint8Array.from(bytes)
  const vector = new Float32Array(copy.buffer)
  if (vector.length !== dimensions) throw new Error('stored embedding dimensions do not match vector bytes')
  return vector
}

function cosine(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return -1
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!
    leftMagnitude += left[index]! ** 2
    rightMagnitude += right[index]! ** 2
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return -1
  return dot / Math.sqrt(leftMagnitude * rightMagnitude)
}

function ftsQuery(query: string): string | null {
  const tokens = query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []
  if (tokens.length === 0) return null
  return tokens.slice(0, 24).map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ')
}

function excerpt(body: string, query: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  const token = query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/u)?.[0]
  const index = token === undefined ? 0 : normalized.toLocaleLowerCase().indexOf(token)
  const start = Math.max(0, index < 0 ? 0 : index - 80)
  return normalized.slice(start, start + 240)
}

async function optionalEmbedding(provider: EmbeddingProvider | undefined, text: string): Promise<Float32Array | null> {
  if (provider === undefined) return null
  try {
    return await provider.embed(text)
  } catch {
    return null
  }
}

function initialize(db: Database): void {
  db.run('PRAGMA journal_mode = DELETE')
  db.run('PRAGMA synchronous = FULL')
  db.run(`CREATE TABLE documents (
    document_id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    citations TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding BLOB,
    embedding_dimensions INTEGER,
    embedding_provider TEXT
  )`)
  db.run("CREATE VIRTUAL TABLE documents_fts USING fts5(document_id UNINDEXED, title, body, tokenize='unicode61')")
}

export class KnowledgeIndex {
  readonly databasePath: string

  constructor(
    private readonly vault: FilesystemVault,
    databasePath?: string,
    private readonly embeddings?: EmbeddingProvider,
  ) {
    this.databasePath = resolve(databasePath ?? `${vault.root}/.index/knowledge.sqlite`)
  }

  async rebuild(): Promise<{ documents: number; embeddings: number }> {
    const documents = await this.vault.listDocuments()
    await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 })
    const temporary = `${this.databasePath}.rebuild-${crypto.randomUUID()}`
    const db = new Database(temporary, { create: true, strict: true })
    let embedded = 0
    try {
      initialize(db)
      const insertDocument = db.prepare(`INSERT INTO documents
        (document_id, relative_path, document_type, title, body, citations, content_hash, embedding, embedding_dimensions, embedding_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const insertFts = db.prepare('INSERT INTO documents_fts(document_id, title, body) VALUES (?, ?, ?)')
      const transaction = db.transaction((entries: StoredDocument[]) => {
        for (const entry of entries) {
          insertDocument.run(
            entry.documentId,
            entry.relativePath,
            entry.documentType,
            entry.title,
            entry.body,
            canonicalJson(entry.citations),
            documents.find((document) => document.relativePath === entry.relativePath)!.fileHash,
            entry.embedding === null ? null : encodeVector(entry.embedding),
            entry.embedding?.length ?? null,
            entry.embedding === null ? null : this.embeddings!.name,
          )
          insertFts.run(entry.documentId, entry.title, entry.body)
        }
      })
      const entries: StoredDocument[] = []
      for (const document of documents) {
        const embedding = await optionalEmbedding(this.embeddings, `${title(document)}\n${document.body}`)
        if (embedding !== null) embedded += 1
        entries.push({
          documentId: documentId(document),
          relativePath: document.relativePath,
          documentType: document.metadata.documentType,
          title: title(document),
          body: document.body,
          citations: citations(document),
          embedding,
        })
      }
      transaction(entries)
    } finally {
      db.close()
    }
    await rename(temporary, this.databasePath)
    return { documents: documents.length, embeddings: embedded }
  }

  async search(query: string, options: { mode?: SearchMode; limit?: number } = {}): Promise<SearchResponse> {
    const requestedMode = options.mode ?? 'lexical'
    const limit = Math.max(1, Math.min(options.limit ?? 10, 50))
    const expression = ftsQuery(query)
    if (expression === null) return { query, requestedMode, effectiveMode: 'lexical', results: [] }
    const db = new Database(this.databasePath, { readonly: true, strict: true })
    try {
      const lexicalRows = db.query<SearchRow, [string, number]>(`SELECT d.*, bm25(documents_fts) AS rank
        FROM documents_fts JOIN documents d ON d.document_id = documents_fts.document_id
        WHERE documents_fts MATCH ? ORDER BY rank LIMIT ?`).all(expression, limit * 4)
      const lexical = new Map(lexicalRows.map((row, index) => [row.document_id, { row, score: 1 / (1 + index) }]))
      let effectiveMode: SearchResponse['effectiveMode'] = 'lexical'
      let scored = [...lexical.values()]
      if (requestedMode === 'hybrid') {
        const queryVector = await optionalEmbedding(this.embeddings, query)
        if (queryVector === null) {
          effectiveMode = 'lexical-fallback'
        } else {
          effectiveMode = 'hybrid'
          const vectorRows = db.query<SearchRow, []>('SELECT * FROM documents WHERE embedding IS NOT NULL').all()
          if (vectorRows.length === 0) effectiveMode = 'lexical-fallback'
          const vectorScores = vectorRows
            .map((row) => ({ row, score: cosine(queryVector, decodeVector(row.embedding!, row.embedding_dimensions!)) }))
            .filter((entry) => entry.score >= 0)
            .sort((left, right) => right.score - left.score)
          const combined = new Map<string, { row: SearchRow; score: number }>()
          for (const entry of vectorScores.slice(0, limit * 4)) {
            combined.set(entry.row.document_id, { row: entry.row, score: Math.max(0, entry.score) * 0.4 })
          }
          for (const entry of lexical.values()) {
            const current = combined.get(entry.row.document_id)
            combined.set(entry.row.document_id, { row: entry.row, score: (current?.score ?? 0) + entry.score * 0.6 })
          }
          scored = [...combined.values()].sort((left, right) => right.score - left.score)
        }
      }
      const results: SearchResult[] = scored.slice(0, limit).map(({ row, score }) => ({
        documentId: row.document_id,
        relativePath: row.relative_path,
        documentType: row.document_type,
        title: row.title,
        excerpt: excerpt(row.body, query),
        score,
        retrieval: effectiveMode,
        citations: JSON.parse(row.citations) as CitationMetadata[],
      }))
      return { query, requestedMode, effectiveMode, results }
    } finally {
      db.close()
    }
  }
}
