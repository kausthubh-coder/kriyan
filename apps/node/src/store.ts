import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface RunCheckpoint {
  jobId: string
  runId: string
  commandId: string
  attempt: number
  nextSequence: number
  effectCommitted: boolean
  completed: boolean
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
      return JSON.parse(await readFile(this.checkpointPath(runId), 'utf8')) as RunCheckpoint
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
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
    await appendFile(
      join(this.runDir(runId), 'transcript.jsonl'),
      `${JSON.stringify(event)}\n`,
      { mode: 0o600 },
    )
  }

  async cleanupWorkspace(runId: string): Promise<void> {
    await rm(this.workspace(runId), { recursive: true, force: true })
  }
}
