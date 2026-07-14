import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { canonicalJson, sha256 } from './ids'
import { AtomicFileStore } from './atomic-store'

export type MemoryCorrectionAction = 'retract' | 'replace' | 'restore'

export interface MemoryCorrectionEntry {
  correctionId: string
  targetKind: string
  targetId: string
  action: MemoryCorrectionAction
  replacement?: string
  reason: string
  revision: number
  provenanceIds: string[]
}

export interface MemoryLedgerEvent {
  eventId: string
  sequence: number
  kind: 'projection' | 'correction' | 'tombstone' | 'conflict'
  targetKind: string
  targetId: string
  revision: number
  value?: string
  correctionId?: string
  action?: MemoryCorrectionAction
  reason?: string
  provenanceIds: string[]
}

export interface ProjectedMemoryRecord {
  targetKind: string
  targetId: string
  revision: number
  value: string
  provenanceIds: string[]
  tombstoned: boolean
}

export type MemoryProjectionDecision =
  | { status: 'projected'; record: ProjectedMemoryRecord }
  | { status: 'stale' | 'replayed' | 'suppressed' | 'conflict'; record?: ProjectedMemoryRecord; correction?: MemoryCorrectionEntry }

function key(kind: string, id: string): string {
  return `${kind}\u0000${id}`
}

export class MemoryLedger {
  private eventsCache: MemoryLedgerEvent[] | null = null
  private serial = Promise.resolve()
  private readonly files: AtomicFileStore

  constructor(readonly root: string) {
    this.files = new AtomicFileStore(root)
  }

  private get path(): string {
    return join(this.root, '.kriyan', 'memory-ledger.jsonl')
  }

  private async events(): Promise<MemoryLedgerEvent[]> {
    if (this.eventsCache !== null) return this.eventsCache
    const raw = await readFile(this.path, 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    })
    const events = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as MemoryLedgerEvent)
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) throw new Error('memory ledger sequence is corrupt')
    }
    this.eventsCache = events
    return events
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

  private async append(event: Omit<MemoryLedgerEvent, 'eventId' | 'sequence'>): Promise<MemoryLedgerEvent> {
    const events = await this.events()
    const sequence = events.length + 1
    const value: MemoryLedgerEvent = {
      ...event,
      sequence,
      eventId: `memory-event:${sequence}:${sha256(canonicalJson(event)).slice(0, 16)}`,
    }
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const handle = await open(this.path, 'a', 0o600)
    try {
      await handle.writeFile(`${canonicalJson(value)}\n`)
      await handle.sync()
    } finally {
      await handle.close()
    }
    events.push(value)
    return value
  }

  private async writeCorrectionRevision(correction: MemoryCorrectionEntry): Promise<void> {
    const relativePath = [
      'memory-revisions',
      sha256(correction.targetKind).slice(0, 16),
      `${sha256(correction.correctionId)}.md`,
    ].join('/')
    const metadata = {
      schemaVersion: 1,
      documentType: 'memory-correction-revision',
      correctionId: correction.correctionId,
      targetKind: correction.targetKind,
      targetId: correction.targetId,
      action: correction.action,
      revision: correction.revision,
      provenanceIds: [...new Set(correction.provenanceIds)].sort(),
    }
    const replacement = correction.replacement === undefined ? '' : `\n\n## Replacement\n\n${correction.replacement}`
    await this.files.write(
      relativePath,
      `---\n${canonicalJson(metadata)}\n---\n\n${correction.reason.trim()}${replacement}\n`,
    )
  }

  private state(events: readonly MemoryLedgerEvent[]): {
    records: Map<string, ProjectedMemoryRecord>
    corrections: Map<string, MemoryCorrectionEntry>
  } {
    const records = new Map<string, ProjectedMemoryRecord>()
    const corrections = new Map<string, MemoryCorrectionEntry>()
    for (const event of events) {
      const targetKey = key(event.targetKind, event.targetId)
      if (event.kind === 'projection') {
        records.set(targetKey, {
          targetKind: event.targetKind,
          targetId: event.targetId,
          revision: event.revision,
          value: event.value ?? '',
          provenanceIds: event.provenanceIds,
          tombstoned: false,
        })
      } else if (event.kind === 'tombstone') {
        const existing = records.get(targetKey)
        if (existing !== undefined) records.set(targetKey, { ...existing, revision: event.revision, tombstoned: true })
      } else if (event.kind === 'correction' && event.correctionId !== undefined && event.action !== undefined) {
        const correction: MemoryCorrectionEntry = {
          correctionId: event.correctionId,
          targetKind: event.targetKind,
          targetId: event.targetId,
          action: event.action,
          replacement: event.value,
          reason: event.reason ?? '',
          revision: event.revision,
          provenanceIds: event.provenanceIds,
        }
        if (event.action === 'restore') corrections.delete(targetKey)
        else corrections.set(targetKey, correction)
      }
    }
    return { records, corrections }
  }

  async project(record: Omit<ProjectedMemoryRecord, 'tombstoned'>): Promise<MemoryProjectionDecision> {
    return await this.exclusive(async () => {
      const events = await this.events()
      const state = this.state(events)
      const targetKey = key(record.targetKind, record.targetId)
      const correction = state.corrections.get(targetKey)
      if (correction !== undefined && record.revision > correction.revision) {
        return { status: 'conflict', correction }
      }
      if (correction?.action === 'retract') return { status: 'suppressed', correction }
      const effective = correction?.action === 'replace' && correction.replacement !== undefined
        ? { ...record, value: correction.replacement }
        : record
      const existing = state.records.get(targetKey)
      if (existing !== undefined && existing.revision > effective.revision) return { status: 'stale', record: existing }
      if (existing !== undefined && existing.revision === effective.revision && existing.value === effective.value && !existing.tombstoned) {
        return { status: 'replayed', record: existing }
      }
      await this.append({
        kind: 'projection',
        targetKind: effective.targetKind,
        targetId: effective.targetId,
        revision: effective.revision,
        value: effective.value,
        provenanceIds: [...new Set(effective.provenanceIds)].sort(),
      })
      return { status: 'projected', record: { ...effective, tombstoned: false } }
    })
  }

  async correct(correction: MemoryCorrectionEntry): Promise<'applied' | 'replayed'> {
    return await this.exclusive(async () => {
      const events = await this.events()
      await this.writeCorrectionRevision(correction)
      if (events.some((event) => event.correctionId === correction.correctionId && event.action === correction.action && event.revision === correction.revision)) {
        return 'replayed'
      }
      await this.append({
        kind: 'correction',
        targetKind: correction.targetKind,
        targetId: correction.targetId,
        revision: correction.revision,
        value: correction.replacement,
        correctionId: correction.correctionId,
        action: correction.action,
        reason: correction.reason,
        provenanceIds: [...new Set(correction.provenanceIds)].sort(),
      })
      return 'applied'
    })
  }

  async reconcile(authoritative: readonly Omit<ProjectedMemoryRecord, 'tombstoned'>[]): Promise<{
    projected: number
    tombstoned: string[]
  }> {
    let projected = 0
    for (const record of authoritative) {
      if ((await this.project(record)).status === 'projected') projected += 1
    }
    return await this.exclusive(async () => {
      const events = await this.events()
      const state = this.state(events)
      const present = new Set(authoritative.map((record) => key(record.targetKind, record.targetId)))
      const tombstoned: string[] = []
      for (const [recordKey, record] of state.records) {
        if (!record.tombstoned && !present.has(recordKey)) {
          await this.append({
            kind: 'tombstone',
            targetKind: record.targetKind,
            targetId: record.targetId,
            revision: record.revision + 1,
            provenanceIds: record.provenanceIds,
          })
          tombstoned.push(record.targetId)
        }
      }
      return { projected, tombstoned: tombstoned.sort() }
    })
  }

  async snapshot(): Promise<{ records: ProjectedMemoryRecord[]; corrections: MemoryCorrectionEntry[]; events: MemoryLedgerEvent[] }> {
    const events = [...await this.events()]
    const state = this.state(events)
    return {
      records: [...state.records.values()].sort((left, right) => left.targetId.localeCompare(right.targetId)),
      corrections: [...state.corrections.values()].sort((left, right) => left.correctionId.localeCompare(right.correctionId)),
      events,
    }
  }
}
