import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { AtomicFileStore } from './atomic-store'
import { canonicalJson, stableId } from './ids'
import type { RegisterSourceInput, SourceKind, SourceRef } from './types'

interface RegistryFile {
  schemaVersion: 1
  sources: SourceRef[]
}

const REGISTRY_PATH = 'sources/registry.json'

function normalizeLocation(kind: SourceKind, value: string): string {
  const location = value.trim()
  if (location.length === 0) throw new Error('source location is required')
  if (kind === 'local') return resolve(location)
  if (kind === 'git' && !location.includes('://') && !location.startsWith('git@')) {
    return resolve(location)
  }
  if (kind === 'drive' && /^[A-Za-z0-9_-]{10,}$/.test(location)) return `drive:${location}`
  let url: URL
  try {
    url = new URL(location)
  } catch {
    throw new Error(`${kind} source must be an absolute URL`)
  }
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
    throw new Error(`${kind} source uses an unsupported protocol`)
  }
  if (kind === 'github' && (url.protocol !== 'https:' || url.hostname !== 'github.com')) {
    throw new Error('GitHub source must use an https://github.com URL')
  }
  if ((kind === 'web' || kind === 'drive') && !['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${kind} source must use HTTP or HTTPS`)
  }
  url.hash = ''
  return url.toString()
}

export class SourceRegistry {
  private readonly store: AtomicFileStore

  constructor(private readonly vaultRoot: string) {
    this.store = new AtomicFileStore(vaultRoot)
  }

  private async readFile(): Promise<RegistryFile> {
    try {
      const parsed = JSON.parse(await readFile(this.store.resolvePath(REGISTRY_PATH), 'utf8')) as RegistryFile
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sources)) throw new Error('invalid source registry')
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, sources: [] }
      throw error
    }
  }

  async register(input: RegisterSourceInput): Promise<SourceRef> {
    const location = normalizeLocation(input.kind, input.location)
    const displayName = input.displayName.trim()
    if (displayName.length === 0) throw new Error('source display name is required')
    const sourceRef: SourceRef = {
      schemaVersion: 1,
      sourceRefId: stableId('source', input.kind, location),
      kind: input.kind,
      displayName,
      location,
      sourceVersion: input.sourceVersion?.trim() || undefined,
    }
    const registry = await this.readFile()
    const existing = registry.sources.find((entry) => entry.sourceRefId === sourceRef.sourceRefId)
    if (existing !== undefined) {
      if (existing.kind !== sourceRef.kind || existing.location !== sourceRef.location) {
        throw new Error('stable source identifier collision')
      }
      const updated: SourceRef = {
        ...existing,
        displayName: sourceRef.displayName,
        sourceVersion: sourceRef.sourceVersion ?? existing.sourceVersion,
      }
      if (canonicalJson(updated) === canonicalJson(existing)) return existing
      const expectedHash = await this.store.hash(REGISTRY_PATH)
      registry.sources = registry.sources.map((entry) => entry.sourceRefId === updated.sourceRefId ? updated : entry)
      await this.store.write(REGISTRY_PATH, `${canonicalJson(registry)}\n`, expectedHash)
      return updated
    }
    const expectedHash = await this.store.hash(REGISTRY_PATH)
    registry.sources.push(sourceRef)
    registry.sources.sort((left, right) => left.sourceRefId.localeCompare(right.sourceRefId))
    await this.store.write(REGISTRY_PATH, `${canonicalJson(registry)}\n`, expectedHash)
    return sourceRef
  }

  async get(sourceRefId: string): Promise<SourceRef | null> {
    return (await this.readFile()).sources.find((entry) => entry.sourceRefId === sourceRefId) ?? null
  }

  async list(): Promise<SourceRef[]> {
    return [...(await this.readFile()).sources]
  }
}
