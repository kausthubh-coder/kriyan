import { readFile, readdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { AtomicFileStore } from './atomic-store'
import { canonicalJson, sha256 } from './ids'

export interface ArtifactProjectionInput {
  artifactId: string
  noteId: string
  noteVersionId: string
  version: number
  contentHash: string
  contentJson: string
  title: string
  plainText: string
  projectedPath: string
  priorProjectedHash?: string
  priorProjectedPath?: string
}

export interface ArtifactProjectionRecord {
  artifactId: string
  noteId: string
  noteVersionId: string
  version: number
  contentHash: string
  projectedHash: string
  projectedPath: string
  tombstoned: boolean
}

interface ArtifactManifest {
  schemaVersion: 1
  records: Record<string, ArtifactProjectionRecord>
}

export type ArtifactProjectionResult =
  | { status: 'written'; record: ArtifactProjectionRecord }
  | { status: 'stale' | 'replayed'; record: ArtifactProjectionRecord }

const MANIFEST_PATH = '.kriyan/artifact-manifest.json'

function renderArtifact(input: ArtifactProjectionInput): string {
  const metadata = {
    schemaVersion: 1,
    documentType: 'artifact-projection',
    artifactId: input.artifactId,
    noteId: input.noteId,
    noteVersionId: input.noteVersionId,
    version: input.version,
    contentHash: input.contentHash,
    readOnly: true,
  }
  let body = input.plainText.trim()
  try {
    body = tipTapMarkdown(JSON.parse(input.contentJson) as unknown).trim() || body
  } catch {
    // The accepted note version already validates TipTap JSON. A compact plain
    // text fallback keeps materialization deterministic if an older version is
    // not representable by this projection renderer.
  }
  return `---\n${canonicalJson(metadata)}\n---\n\n# ${input.title.trim() || 'Untitled'}\n\n${body}\n`
}

function tipTapMarkdown(node: unknown, depth = 0): string {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return ''
  const value = node as { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; content?: unknown[] }
  if (value.type === 'text') return typeof value.text === 'string' ? value.text : ''
  if (value.type === 'hardBreak') return '\n'
  const children = Array.isArray(value.content)
    ? value.content.map((child) => tipTapMarkdown(child, depth + 1)).join('')
    : ''
  if (value.type === 'paragraph') return `${children}\n\n`
  if (value.type === 'heading') {
    const level = Math.max(1, Math.min(6, Number(value.attrs?.level) || 2))
    return `${'#'.repeat(level)} ${children}\n\n`
  }
  if (value.type === 'bulletList' || value.type === 'orderedList') {
    return `${children}\n`
  }
  if (value.type === 'listItem') {
    return `${'  '.repeat(Math.max(0, depth - 2))}- ${children.trim()}\n`
  }
  if (value.type === 'blockquote') return `${children.trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`
  if (value.type === 'codeBlock') return `\`\`\`\n${children.trim()}\n\`\`\`\n\n`
  return children
}

async function markdownFiles(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) output.push(...await markdownFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(path)
  }
  return output
}

export class ArtifactProjectionStore {
  readonly files: AtomicFileStore
  private serial = Promise.resolve()

  constructor(readonly root: string) {
    this.files = new AtomicFileStore(root)
  }

  private async manifest(): Promise<ArtifactManifest> {
    try {
      const value: unknown = JSON.parse(await readFile(this.files.resolvePath(MANIFEST_PATH), 'utf8'))
      if (typeof value !== 'object' || value === null || (value as ArtifactManifest).schemaVersion !== 1) {
        throw new Error('invalid artifact manifest')
      }
      return value as ArtifactManifest
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, records: {} }
      throw error
    }
  }

  private async saveManifest(manifest: ArtifactManifest): Promise<void> {
    await this.files.write(MANIFEST_PATH, `${canonicalJson(manifest)}\n`)
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.serial
    let release!: () => void
    this.serial = new Promise<void>((resolve) => (release = resolve))
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  async materialize(input: ArtifactProjectionInput): Promise<ArtifactProjectionResult> {
    return await this.exclusive(async () => {
      const manifest = await this.manifest()
      const existing = manifest.records[input.artifactId]
      if (existing !== undefined && !existing.tombstoned) {
        if (existing.version > input.version) return { status: 'stale', record: existing }
        if (
          existing.version === input.version &&
          existing.noteVersionId === input.noteVersionId &&
          existing.contentHash === input.contentHash
        ) {
          return { status: 'replayed', record: existing }
        }
      }
      if (existing?.projectedHash !== undefined && input.priorProjectedHash !== undefined &&
        existing.projectedHash !== input.priorProjectedHash) {
        return { status: 'stale', record: existing }
      }

      const body = renderArtifact(input)
      const projectedHash = await this.files.write(input.projectedPath, body)
      const record: ArtifactProjectionRecord = {
        artifactId: input.artifactId,
        noteId: input.noteId,
        noteVersionId: input.noteVersionId,
        version: input.version,
        contentHash: input.contentHash,
        projectedHash,
        projectedPath: input.projectedPath,
        tombstoned: false,
      }
      manifest.records[input.artifactId] = record
      await this.saveManifest(manifest)

      const oldPath = input.priorProjectedPath ?? existing?.projectedPath
      if (oldPath !== undefined && oldPath !== input.projectedPath) {
        await rm(this.files.resolvePath(oldPath), { force: true })
      }
      return { status: 'written', record }
    })
  }

  async tombstone(
    artifactId: string,
    noteVersionId: string,
    expectedProjectedHash?: string,
  ): Promise<'tombstoned' | 'stale' | 'missing'> {
    return await this.exclusive(async () => {
      const manifest = await this.manifest()
      const existing = manifest.records[artifactId]
      if (existing === undefined) return 'missing'
      if (existing.noteVersionId !== noteVersionId ||
        (expectedProjectedHash !== undefined && existing.projectedHash !== expectedProjectedHash)) {
        return 'stale'
      }
      manifest.records[artifactId] = { ...existing, tombstoned: true }
      await this.saveManifest(manifest)
      await rm(this.files.resolvePath(existing.projectedPath), { force: true })
      return 'tombstoned'
    })
  }

  async reconcile(authoritative: readonly ArtifactProjectionRecord[]): Promise<{
    recoveredWrites: number
    removedOrphans: string[]
  }> {
    return await this.exclusive(async () => {
      const recoveredWrites = await this.files.recover()
      const manifest: ArtifactManifest = {
        schemaVersion: 1,
        records: Object.fromEntries(authoritative.map((record) => [record.artifactId, record])),
      }
      const activePaths = new Set(authoritative.filter((record) => !record.tombstoned).map((record) => record.projectedPath))
      const artifactsRoot = this.files.resolvePath('artifacts')
      const removedOrphans: string[] = []
      for (const absolute of await markdownFiles(artifactsRoot)) {
        const path = join('artifacts', relative(artifactsRoot, absolute))
        if (!activePaths.has(path)) {
          await rm(absolute, { force: true })
          removedOrphans.push(path)
        }
      }
      await this.saveManifest(manifest)
      return { recoveredWrites, removedOrphans: removedOrphans.sort() }
    })
  }

  async records(): Promise<ArtifactProjectionRecord[]> {
    return Object.values((await this.manifest()).records).sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId),
    )
  }
}

export function artifactProjectedHash(content: string): string {
  return sha256(content)
}
