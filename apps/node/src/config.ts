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
  heartbeatIntervalMs: number
  shutdownGraceMs: number
  timezone: string
  locale: string
  runtime: 'fake' | 'pi'
}

export class ConfigError extends Error {
  readonly code = 'CONFIG_INVALID'
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/
const ALLOWED_CONFIG_KEYS = new Set([
  'convexUrl',
  'installationId',
  'nodeId',
  'displayName',
  'protocolVersion',
  'dataDir',
  'leaseDurationMs',
  'pollIntervalMs',
  'heartbeatIntervalMs',
  'shutdownGraceMs',
  'timezone',
  'locale',
  'runtime',
])

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(`${name} is required`)
  }
  return value.trim()
}

function positive(value: unknown, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new ConfigError(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value as number
}

export function validateConfig(input: unknown): NodeConfig {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ConfigError('config must be a JSON object')
  }
  const value = input as Record<string, unknown>
  const unknown = Object.keys(value).filter((key) => !ALLOWED_CONFIG_KEYS.has(key))
  if (unknown.length > 0) {
    throw new ConfigError(`config contains unsupported fields: ${unknown.sort().join(', ')}`)
  }
  const convexUrl = required(value.convexUrl, 'convexUrl')
  let parsedUrl: URL
  try {
    parsedUrl = new URL(convexUrl)
  } catch {
    throw new ConfigError('convexUrl must be a valid URL')
  }
  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.hostname !== 'localhost' &&
    parsedUrl.hostname !== '127.0.0.1'
  ) {
    throw new ConfigError('convexUrl must use HTTPS except for localhost')
  }
  if (
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new ConfigError('convexUrl must not contain credentials, query, or fragment data')
  }
  const installationId = required(value.installationId, 'installationId')
  const nodeId = required(value.nodeId, 'nodeId')
  if (!ID.test(installationId) || !ID.test(nodeId)) {
    throw new ConfigError('installationId and nodeId must be stable identifiers')
  }
  const runtime = value.runtime ?? 'fake'
  if (runtime !== 'fake' && runtime !== 'pi') throw new ConfigError('runtime must be fake or pi')
  const timezone = required(value.timezone ?? 'UTC', 'timezone')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0)
  } catch {
    throw new ConfigError('timezone must be an IANA time zone')
  }
  const locale = required(value.locale ?? 'en-US', 'locale')
  try {
    new Intl.Locale(locale)
  } catch {
    throw new ConfigError('locale must be a valid BCP 47 locale')
  }
  return {
    convexUrl: parsedUrl.toString().replace(/\/$/, ''),
    installationId,
    nodeId,
    displayName: required(value.displayName ?? 'Kriyan node', 'displayName'),
    protocolVersion: required(value.protocolVersion ?? '1', 'protocolVersion'),
    dataDir: resolve(required(value.dataDir, 'dataDir')),
    leaseDurationMs: positive(value.leaseDurationMs ?? 30_000, 'leaseDurationMs', 30_000),
    pollIntervalMs: positive(value.pollIntervalMs ?? 1_000, 'pollIntervalMs', 60_000),
    heartbeatIntervalMs: positive(
      value.heartbeatIntervalMs ?? 20_000,
      'heartbeatIntervalMs',
      20_000,
    ),
    shutdownGraceMs: positive(value.shutdownGraceMs ?? 35_000, 'shutdownGraceMs', 40_000),
    timezone,
    locale,
    runtime,
  }
}

export async function loadConfig(path: string): Promise<NodeConfig> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(`config file not found: ${path}`)
    }
    throw error
  }
  try {
    return validateConfig(JSON.parse(raw))
  } catch (error) {
    if (error instanceof ConfigError) throw error
    throw new ConfigError(`config file is not valid JSON: ${path}`)
  }
}

export async function saveConfig(path: string, config: NodeConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}
