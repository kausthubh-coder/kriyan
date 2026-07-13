import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface RunCheckpoint {
  version: 2
  jobId: string
  runId: string
  commandId: string
  attempt: number
  nextSequence: number
  preparedEffects: Record<string, { kind: 'reminder'; committed: boolean }>
  completed: boolean
  piSessionFile?: string
}

const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024

export class CorruptCheckpointError extends Error {
  readonly code = 'CHECKPOINT_CORRUPT'
}

function isCheckpoint(value: unknown, runId: string): value is RunCheckpoint {
  if (typeof value !== 'object' || value === null) return false
  const checkpoint = value as Partial<RunCheckpoint>
  return (
    checkpoint.version === 2 &&
    checkpoint.runId === runId &&
    typeof checkpoint.jobId === 'string' &&
    typeof checkpoint.commandId === 'string' &&
    Number.isSafeInteger(checkpoint.attempt) &&
    Number.isSafeInteger(checkpoint.nextSequence) &&
    typeof checkpoint.preparedEffects === 'object' &&
    checkpoint.preparedEffects !== null &&
    typeof checkpoint.completed === 'boolean'
  )
}

export class LocalRunStore {
  constructor(private readonly dataDir: string) {}

  private runDir(runId: string): string {
    return join(this.dataDir, 'runs', encodeURIComponent(runId))
  }

  workspace(runId: string): string {
    return join(this.runDir(runId), 'workspace')
  }

  private checkpointPath(runId: string): string {
    return join(this.runDir(runId), 'checkpoint.json')
  }

  async prepare(runId: string): Promise<void> {
    await mkdir(this.workspace(runId), { recursive: true, mode: 0o700 })
    await mkdir(join(this.runDir(runId), 'logs'), { recursive: true, mode: 0o700 })
  }

  async load(runId: string): Promise<RunCheckpoint | null> {
    try {
      const path = this.checkpointPath(runId)
      const value: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (!isCheckpoint(value, runId)) throw new Error('invalid checkpoint shape')
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      const path = this.checkpointPath(runId)
      const quarantine = `${path}.corrupt.${Date.now()}`
      await rename(path, quarantine).catch(() => undefined)
      throw new CorruptCheckpointError(
        `checkpoint for ${runId} was quarantined; automatic replay is disabled`,
      )
    }
  }

  async latestForJob(jobId: string, currentRunId: string): Promise<RunCheckpoint | null> {
    const runsDir = join(this.dataDir, 'runs')
    const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => [])
    const candidates: RunCheckpoint[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      let runId: string
      try {
        runId = decodeURIComponent(entry.name)
      } catch {
        continue
      }
      if (runId === currentRunId || !runId.includes(jobId)) continue
      const checkpoint = await this.load(runId)
      if (checkpoint?.jobId === jobId) candidates.push(checkpoint)
    }
    return candidates.sort((left, right) => right.attempt - left.attempt)[0] ?? null
  }

  async save(checkpoint: RunCheckpoint): Promise<void> {
    await this.prepare(checkpoint.runId)
    const path = this.checkpointPath(checkpoint.runId)
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(checkpoint)}\n`, { mode: 0o600 })
    await rename(temporary, path)
  }

  async appendLocalEvent(runId: string, event: unknown): Promise<void> {
    await this.prepare(runId)
    const path = join(this.runDir(runId), 'transcript.jsonl')
    const currentSize = await stat(path).then((value) => value.size).catch(() => 0)
    const line = `${JSON.stringify(event)}\n`
    if (currentSize + Buffer.byteLength(line) > MAX_TRANSCRIPT_BYTES) {
      throw new Error('local transcript limit exceeded')
    }
    await appendFile(
      path,
      line,
      { mode: 0o600 },
    )
  }

  async cleanupWorkspace(runId: string): Promise<void> {
    await rm(this.workspace(runId), { recursive: true, force: true })
  }
}
