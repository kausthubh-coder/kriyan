import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface ProcessHealthRecord {
  schemaVersion: 1
  installationId: string
  nodeId: string
  processInstanceId: string
  releaseId: string
  pid: number
  startedAt: number
  heartbeatAt: number
  ready: boolean
}

export interface ProcessHealthExpectation {
  expectedRelease?: string
  notInstance?: string
  heartbeatAfter?: number
  stabilityMs?: number
  observedAt?: number
}

export function processHealthPath(dataDir: string): string {
  return join(dataDir, 'process-health.json')
}

export async function writeProcessHealth(
  dataDir: string,
  record: ProcessHealthRecord,
): Promise<void> {
  const path = processHealthPath(dataDir)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

export async function readProcessHealth(dataDir: string): Promise<ProcessHealthRecord | null> {
  try {
    const value: unknown = JSON.parse(await readFile(processHealthPath(dataDir), 'utf8'))
    if (typeof value !== 'object' || value === null) return null
    const record = value as Partial<ProcessHealthRecord>
    if (
      record.schemaVersion !== 1 ||
      typeof record.installationId !== 'string' ||
      typeof record.nodeId !== 'string' ||
      typeof record.processInstanceId !== 'string' ||
      typeof record.releaseId !== 'string' ||
      !Number.isSafeInteger(record.pid) ||
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.heartbeatAt) ||
      record.ready !== true
    ) {
      return null
    }
    return record as ProcessHealthRecord
  } catch {
    return null
  }
}

export function satisfiesProcessHealth(
  record: ProcessHealthRecord,
  expectation: ProcessHealthExpectation,
): boolean {
  const observedAt = expectation.observedAt ?? Date.now()
  return (
    (expectation.expectedRelease === undefined ||
      record.releaseId === expectation.expectedRelease) &&
    (expectation.notInstance === undefined ||
      record.processInstanceId !== expectation.notInstance) &&
    (expectation.heartbeatAfter === undefined ||
      record.heartbeatAt > expectation.heartbeatAfter) &&
    observedAt - record.startedAt >= (expectation.stabilityMs ?? 0) &&
    record.heartbeatAt >= record.startedAt
  )
}
