import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface NodeConfig {
  convexUrl: string
  installationId: string
  nodeId: string
  displayName: string
  protocolVersion: string
  dataDir: string
  leaseDurationMs: number
  pollIntervalMs: number
  runtime: 'fake' | 'pi'
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function positive(value: unknown, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value as number
}

export function validateConfig(input: unknown): NodeConfig {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('config must be a JSON object')
  }
  const value = input as Record<string, unknown>
  const convexUrl = required(value.convexUrl, 'convexUrl')
  const parsedUrl = new URL(convexUrl)
  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.hostname !== 'localhost' &&
    parsedUrl.hostname !== '127.0.0.1'
  ) {
    throw new Error('convexUrl must use HTTPS except for localhost')
  }
  const installationId = required(value.installationId, 'installationId')
  const nodeId = required(value.nodeId, 'nodeId')
  if (!ID.test(installationId) || !ID.test(nodeId)) {
    throw new Error('installationId and nodeId must be stable identifiers')
  }
  const runtime = value.runtime ?? 'fake'
  if (runtime !== 'fake' && runtime !== 'pi') throw new Error('runtime must be fake or pi')
  return {
    convexUrl: parsedUrl.toString().replace(/\/$/, ''),
    installationId,
    nodeId,
    displayName: required(value.displayName ?? 'Kriyan node', 'displayName'),
    protocolVersion: required(value.protocolVersion ?? '1', 'protocolVersion'),
    dataDir: resolve(required(value.dataDir, 'dataDir')),
    leaseDurationMs: positive(value.leaseDurationMs ?? 30_000, 'leaseDurationMs', 30_000),
    pollIntervalMs: positive(value.pollIntervalMs ?? 1_000, 'pollIntervalMs', 60_000),
    runtime,
  }
}

export async function loadConfig(path: string): Promise<NodeConfig> {
  const raw = await readFile(path, 'utf8')
  return validateConfig(JSON.parse(raw))
}

export async function saveConfig(path: string, config: NodeConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}
