import { homedir } from 'node:os'
import { join } from 'node:path'

import { ConvexControlPlane, type ControlPlane } from '@kriyan/convex-client'

import { loadConfig, saveConfig, validateConfig } from '../../node/src/config'
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

const defaultIo: CliIo = {
  out: (value) => console.log(value),
  err: (value) => console.error(value),
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name)
  if (value === undefined) throw new Error(`${name} is required`)
  return value
}

function configPath(args: string[]): string {
  return option(args, '--config') ?? join(homedir(), '.config', 'kriyan', 'node.json')
}

function json(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value))
}

const HELP = `kriyan <command>

Commands:
  setup --convex-url URL --installation-id ID --node-id ID --data-dir PATH [--config PATH]
  pair [--config PATH]
  node run [--config PATH]
  status [--config PATH]
  doctor [--config PATH]
  submit --text TEXT [--idempotency-key KEY] [--config PATH]

Output is newline-delimited JSON. Usage errors exit 2; runtime errors exit 1.`

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<number> {
  const io = dependencies.io ?? defaultIo
  const planeFactory = dependencies.plane ?? ((url) => new ConvexControlPlane(url))
  const nodeRunner = dependencies.runNode ?? runNode
  const now = dependencies.now ?? Date.now
  try {
    if (args.length === 0 || args[0] === 'help' || args.includes('--help')) {
      io.out(HELP)
      return 0
    }
    const command = args[0]
    if (command === 'setup') {
      const path = configPath(args)
      const config = validateConfig({
        convexUrl: requiredOption(args, '--convex-url'),
        installationId: requiredOption(args, '--installation-id'),
        nodeId: requiredOption(args, '--node-id'),
        displayName: option(args, '--display-name') ?? 'Kriyan node',
        protocolVersion: '1',
        dataDir: requiredOption(args, '--data-dir'),
        leaseDurationMs: 30_000,
        pollIntervalMs: 1_000,
        runtime: option(args, '--runtime') ?? 'fake',
      })
      await saveConfig(path, config)
      json(io, { ok: true, command: 'setup', configPath: path })
      return 0
    }

    const path = configPath(args)
    const config = await loadConfig(path)
    if (command === 'node' && args[1] === 'run') {
      await nodeRunner(path)
      return 0
    }

    const plane = planeFactory(config.convexUrl)
    try {
      if (command === 'pair') {
        const installation = await plane.createInstallation({
          installationId: config.installationId,
          timezone: 'UTC',
          protocolVersion: config.protocolVersion,
        })
        const registration = await plane.registerNode({
          installationId: config.installationId,
          nodeId: config.nodeId,
          displayName: config.displayName,
          capabilities: ['reminders'],
          protocolVersion: config.protocolVersion,
        })
        json(io, {
          ok: true,
          command: 'pair',
          installationCreated: installation.created,
          nodeCreated: registration.created,
          trustBoundary: 'cooperative-development',
        })
        return 0
      }
      if (command === 'status') {
        const nodes = await plane.nodes(config.installationId)
        json(io, { ok: true, command: 'status', nodes })
        return 0
      }
      if (command === 'doctor') {
        const nodes = await plane.nodes(config.installationId)
        const ownNode = nodes.find((node) => node.nodeId === config.nodeId)
        const healthy = ownNode !== undefined && ownNode.status === 'online'
        json(io, {
          ok: healthy,
          command: 'doctor',
          checks: {
            config: 'pass',
            convex: 'pass',
            node: healthy ? 'pass' : 'fail',
            dataDir: config.dataDir,
          },
        })
        return healthy ? 0 : 1
      }
      if (command === 'submit') {
        const text = requiredOption(args, '--text').trim()
        if (text.length === 0 || text.length > 16_384) {
          throw new Error('--text must contain 1 to 16384 characters')
        }
        const idempotencyKey =
          option(args, '--idempotency-key') ?? `cli:${crypto.randomUUID()}`
        const commandId = `command:${now()}:${crypto.randomUUID()}`
        const result = await plane.submit({
          installationId: config.installationId,
          commandId,
          idempotencyKey,
          input: text,
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
      }
    } finally {
      await plane.close()
    }
    throw new Error(`unknown command: ${args.join(' ')}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'command failed'
    io.err(JSON.stringify({ ok: false, error: message }))
    const usageError =
      message.includes('required') ||
      message.includes('unknown command') ||
      message.includes('requires a value') ||
      message.includes('must be')
    return usageError ? 2 : 1
  }
}
