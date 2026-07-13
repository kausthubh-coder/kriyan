import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  ConvexControlPlane,
  deriveNodeHealth,
  type ControlPlane,
} from '@kriyan/convex-client'

import {
  ConfigError,
  loadConfig,
  saveConfig,
  validateConfig,
} from '../../node/src/config'
import { runNode } from '../../node/src/main'

export interface CliIo {
  out(value: string): void
  err(value: string): void
}

export interface CliDependencies {
  io?: CliIo
  plane?: (url: string) => ControlPlane
  runNode?: (configPath: string) => Promise<void>
  now?: () => number
}

export class UsageError extends Error {
  readonly code = 'USAGE_ERROR'
}

const defaultIo: CliIo = {
  out: (value) => console.log(value),
  err: (value) => console.error(value),
}

type ParsedCommand =
  | { name: 'help' }
  | { name: 'setup'; options: Map<string, string> }
  | { name: 'pair' | 'status' | 'doctor'; configPath: string }
  | { name: 'node-run'; configPath: string }
  | { name: 'submit'; configPath: string; text: string; idempotencyKey?: string }

const DEFAULT_CONFIG = (): string => join(homedir(), '.config', 'kriyan', 'node.json')

const COMMAND_OPTIONS: Record<string, ReadonlySet<string>> = {
  setup: new Set([
    '--convex-url',
    '--installation-id',
    '--node-id',
    '--data-dir',
    '--display-name',
    '--runtime',
    '--timezone',
    '--locale',
    '--config',
  ]),
  pair: new Set(['--config']),
  status: new Set(['--config']),
  doctor: new Set(['--config']),
  submit: new Set(['--text', '--idempotency-key', '--config']),
  'node run': new Set(['--config']),
}

function parseOptions(args: string[], command: string): Map<string, string> {
  const allowed = COMMAND_OPTIONS[command]!
  const parsed = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    if (flag === undefined || !flag.startsWith('--')) {
      throw new UsageError(`unexpected argument: ${flag ?? ''}`)
    }
    if (!allowed.has(flag)) throw new UsageError(`unknown option for ${command}: ${flag}`)
    if (parsed.has(flag)) throw new UsageError(`duplicate option: ${flag}`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${flag} requires a value`)
    }
    parsed.set(flag, value)
  }
  return parsed
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name)
  if (value === undefined) throw new UsageError(`${name} is required`)
  return value
}

function configPath(options: Map<string, string>): string {
  return options.get('--config') ?? DEFAULT_CONFIG()
}

function parseCommand(args: string[]): ParsedCommand {
  if (args.length === 0 || (args.length === 1 && (args[0] === 'help' || args[0] === '--help'))) {
    return { name: 'help' }
  }
  if (args.includes('--help')) throw new UsageError('--help must be used by itself')
  const command = args[0]
  if (command === undefined) return { name: 'help' }
  if (command === 'node') {
    if (args[1] !== 'run') throw new UsageError(`unknown command: ${args.slice(0, 2).join(' ')}`)
    const options = parseOptions(args.slice(2), 'node run')
    return { name: 'node-run', configPath: configPath(options) }
  }
  if (!(command in COMMAND_OPTIONS) || command === 'node run') {
    throw new UsageError(`unknown command: ${args.join(' ')}`)
  }
  const options = parseOptions(args.slice(1), command)
  if (command === 'setup') return { name: 'setup', options }
  if (command === 'submit') {
    const text = required(options, '--text').trim()
    if (text.length === 0 || text.length > 16_384) {
      throw new UsageError('--text must contain 1 to 16384 characters')
    }
    return {
      name: 'submit',
      configPath: configPath(options),
      text,
      idempotencyKey: options.get('--idempotency-key'),
    }
  }
  return { name: command, configPath: configPath(options) } as ParsedCommand
}

function json(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value))
}

const HELP = `kriyan <command>

Commands:
  setup --convex-url URL --installation-id ID --node-id ID --data-dir PATH [--timezone IANA] [--locale BCP47] [--config PATH]
  pair [--config PATH]
  node run [--config PATH]
  status [--config PATH]
  doctor [--config PATH]
  submit --text TEXT [--idempotency-key KEY] [--config PATH]

Output is newline-delimited JSON. Usage/config errors exit 2; runtime/health errors exit 1.`

function stableError(error: unknown): { code: string; message: string; exitCode: 1 | 2 } {
  if (error instanceof UsageError) {
    return { code: error.code, message: error.message, exitCode: 2 }
  }
  if (error instanceof ConfigError) {
    return { code: error.code, message: error.message, exitCode: 2 }
  }
  return { code: 'RUNTIME_ERROR', message: 'command failed', exitCode: 1 }
}

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<number> {
  const io = dependencies.io ?? defaultIo
  const planeFactory = dependencies.plane ?? ((url) => new ConvexControlPlane(url))
  const nodeRunner = dependencies.runNode ?? runNode
  const now = dependencies.now ?? Date.now
  try {
    // Parse and validate the entire command surface before config or network I/O.
    const parsed = parseCommand(args)
    if (parsed.name === 'help') {
      io.out(HELP)
      return 0
    }
    if (parsed.name === 'setup') {
      const options = parsed.options
      const path = configPath(options)
      const config = validateConfig({
        convexUrl: required(options, '--convex-url'),
        installationId: required(options, '--installation-id'),
        nodeId: required(options, '--node-id'),
        displayName: options.get('--display-name') ?? 'Kriyan node',
        protocolVersion: '1',
        dataDir: required(options, '--data-dir'),
        leaseDurationMs: 30_000,
        pollIntervalMs: 1_000,
        heartbeatIntervalMs: 20_000,
        shutdownGraceMs: 35_000,
        timezone: options.get('--timezone') ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: options.get('--locale') ?? Intl.DateTimeFormat().resolvedOptions().locale,
        runtime: options.get('--runtime') ?? 'fake',
      })
      await saveConfig(path, config)
      json(io, { ok: true, command: 'setup', configPath: path })
      return 0
    }

    const config = await loadConfig(parsed.configPath)
    if (parsed.name === 'node-run') {
      await nodeRunner(parsed.configPath)
      return 0
    }

    const plane = planeFactory(config.convexUrl)
    try {
      if (parsed.name === 'pair') {
        const installation = await plane.createInstallation({
          installationId: config.installationId,
          timezone: config.timezone,
          protocolVersion: config.protocolVersion,
        })
        json(io, {
          ok: true,
          command: 'pair',
          installationCreated: installation.created,
          node: 'pending_first_heartbeat',
          locale: config.locale,
          timezone: config.timezone,
          trustBoundary: 'cooperative-development',
        })
        return 0
      }
      if (parsed.name === 'status' || parsed.name === 'doctor') {
        const nodes = (await plane.nodes(config.installationId)).map((node) => ({
          ...node,
          health: deriveNodeHealth(node, now()),
        }))
        if (parsed.name === 'status') {
          json(io, { ok: true, command: 'status', observedAt: now(), nodes })
          return 0
        }
        const ownNode = nodes.find((node) => node.nodeId === config.nodeId)
        const healthy = ownNode?.health.status === 'online'
        json(io, {
          ok: healthy,
          command: 'doctor',
          checks: {
            config: 'pass',
            convex: 'pass',
            node: healthy ? 'pass' : 'fail',
            nodeReason: ownNode?.health.reason ?? 'not_registered',
            dataDir: config.dataDir,
          },
        })
        return healthy ? 0 : 1
      }
      if (parsed.name !== 'submit') throw new UsageError('unknown command')
      const idempotencyKey = parsed.idempotencyKey ?? `cli:${crypto.randomUUID()}`
      const commandId = `command:${now()}:${crypto.randomUUID()}`
      const result = await plane.submit({
        installationId: config.installationId,
        commandId,
        idempotencyKey,
        input: parsed.text,
        maxAttempts: 3,
      })
      json(io, {
        ok: true,
        command: 'submit',
        created: result.created,
        commandId,
        jobId: result.job.jobId,
      })
      return 0
    } finally {
      await plane.close()
    }
  } catch (error) {
    const stable = stableError(error)
    io.err(JSON.stringify({ ok: false, error: { code: stable.code, message: stable.message } }))
    return stable.exitCode
  }
}
