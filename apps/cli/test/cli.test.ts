import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { MemoryControlPlane } from '../../node/test/memory-plane'
import { runCli } from '../src/cli'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function capture() {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: { out: (value: string) => stdout.push(value), err: (value: string) => stderr.push(value) },
  }
}

async function setupConfig(extra: string[] = []): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-cli-'))
  directories.push(directory)
  const config = join(directory, 'node.json')
  const output = capture()
  expect(await runCli([
    'setup',
    '--convex-url', 'https://example.convex.cloud',
    '--installation-id', 'installation:test',
    '--node-id', 'node:test',
    '--data-dir', join(directory, 'data'),
    '--timezone', 'America/New_York',
    '--locale', 'en-US',
    '--config', config,
    ...extra,
  ], { io: output.io })).toBe(0)
  return config
}

test('setup is noninteractive and writes explicit locale/timezone to a private config', async () => {
  const config = await setupConfig()
  const value = await Bun.file(config).json()
  expect(value).toMatchObject({ timezone: 'America/New_York', locale: 'en-US' })
  expect((await Bun.file(config).stat()).mode & 0o777).toBe(0o600)
})

describe('exit contract and parse-before-I/O', () => {
  const cases: Array<[string, string[], number]> = [
    ['help', ['help'], 0],
    ['unknown command', ['wat'], 2],
    ['unknown flag', ['status', '--wat', 'x'], 2],
    ['extra arg', ['pair', 'extra'], 2],
    ['missing flag value', ['submit', '--text'], 2],
    ['empty text', ['submit', '--text', '   '], 2],
    ['invalid URL', ['setup', '--convex-url', 'http://public.example'], 2],
  ]
  for (const [name, args, expected] of cases) {
    test(name, async () => {
      const output = capture()
      let networkCalls = 0
      const code = await runCli(args, {
        io: output.io,
        plane: () => {
          networkCalls += 1
          return new MemoryControlPlane()
        },
      })
      expect(code).toBe(expected)
      expect(networkCalls).toBe(0)
    })
  }

  test('help preserves existing commands and documents the VPS lifecycle', async () => {
    const output = capture()
    expect(await runCli(['help'], { io: output.io })).toBe(0)
    expect(output.stdout[0]).toContain('vps install')
    expect(output.stdout[0]).toContain('vps uninstall')
    expect(output.stdout[0]).toContain('setup --convex-url')
    expect(output.stdout[0]).toContain('source register')
    expect(output.stdout[0]).toContain('Help is plaintext')
    expect(output.stdout[0]).toContain('Every operational command emits one newline-delimited JSON object')
  })

  test('missing config is a stable config exit 2', async () => {
    const output = capture()
    const code = await runCli(['doctor', '--config', '/definitely/missing/kriyan.json'], { io: output.io })
    expect(code).toBe(2)
    expect(JSON.parse(output.stderr[0]!)).toMatchObject({
      error: { code: 'CONFIG_INVALID' },
    })
  })

  test('network/runtime failures are generic exit 1', async () => {
    const config = await setupConfig()
    const output = capture()
    const code = await runCli(['status', '--config', config], {
      io: output.io,
      plane: () => {
        throw new Error('Bearer fake-detail')
      },
    })
    expect(code).toBe(1)
    expect(output.stderr.join('')).not.toContain('fake-detail')
    expect(JSON.parse(output.stderr[0]!)).toMatchObject({
      error: { code: 'RUNTIME_ERROR', message: 'command failed' },
    })
  })
})

test('pair leaves registration pending until a real worker heartbeat', async () => {
  const config = await setupConfig()
  const plane = new MemoryControlPlane()
  const pair = capture()
  expect(await runCli(['pair', '--config', config], { io: pair.io, plane: () => plane })).toBe(0)
  expect(plane.nodeRecords.size).toBe(0)
  expect(JSON.parse(pair.stdout[0]!)).toMatchObject({
    node: 'pending_first_heartbeat',
    timezone: 'America/New_York',
  })
  const doctor = capture()
  expect(await runCli(['doctor', '--config', config], { io: doctor.io, plane: () => plane })).toBe(1)
})

test('doctor and status use heartbeat revision and freshness consistently', async () => {
  let now = 1_000
  const config = await setupConfig()
  const plane = new MemoryControlPlane(() => now)
  const registration = await plane.registerNode({
    installationId: 'installation:test',
    nodeId: 'node:test',
    displayName: 'Kriyan node',
    capabilities: ['reminders'],
    protocolVersion: '1',
  })
  const pending = capture()
  expect(await runCli(['doctor', '--config', config], { io: pending.io, plane: () => plane, now: () => now })).toBe(1)
  await plane.heartbeatNode('installation:test', 'node:test', registration.node.revision)
  const healthy = capture()
  expect(await runCli(['doctor', '--config', config], { io: healthy.io, plane: () => plane, now: () => now })).toBe(0)
  now += 60_001
  const status = capture()
  expect(await runCli(['status', '--config', config], { io: status.io, plane: () => plane, now: () => now })).toBe(0)
  expect(JSON.parse(status.stdout[0]!).nodes[0].health).toMatchObject({ status: 'offline', reason: 'stale' })
})

test('submit emits JSON and accepts fully validated options', async () => {
  const config = await setupConfig()
  const output = capture()
  const plane = new MemoryControlPlane()
  expect(await runCli(
    ['submit', '--text', 'remind me to practice Korean', '--idempotency-key', 'idem:cli', '--config', config],
    { io: output.io, plane: () => plane, now: () => 42 },
  )).toBe(0)
  expect(JSON.parse(output.stdout[0]!)).toMatchObject({ ok: true, command: 'submit', created: true })
})

test('submit reuses the existing command for a standalone idempotency-key retry', async () => {
  const config = await setupConfig()
  const plane = new MemoryControlPlane()
  const args = [
    'submit',
    '--text', 'remind me to practice Korean',
    '--idempotency-key', 'idem:standalone-retry',
    '--config', config,
  ]
  const first = capture()
  const second = capture()

  expect(await runCli(args, { io: first.io, plane: () => plane })).toBe(0)
  expect(await runCli(args, { io: second.io, plane: () => plane })).toBe(0)

  const firstResult = JSON.parse(first.stdout[0]!)
  const secondResult = JSON.parse(second.stdout[0]!)
  expect(firstResult).toMatchObject({ created: true })
  expect(secondResult).toMatchObject({ created: false })
  expect(secondResult.commandId).toBe(firstResult.commandId)
  expect(secondResult.jobId).toBe(firstResult.jobId)
  expect(plane.commands.size).toBe(1)
  expect(plane.jobs.size).toBe(1)
})

test('submit keeps conflicting content fail-closed for a reused idempotency key', async () => {
  const config = await setupConfig()
  const plane = new MemoryControlPlane()
  const first = capture()
  const conflict = capture()

  expect(await runCli([
    'submit', '--text', 'first intent', '--idempotency-key', 'idem:conflict', '--config', config,
  ], { io: first.io, plane: () => plane })).toBe(0)
  expect(await runCli([
    'submit', '--text', 'different intent', '--idempotency-key', 'idem:conflict', '--config', config,
  ], { io: conflict.io, plane: () => plane })).toBe(1)

  expect(JSON.parse(conflict.stderr[0]!)).toMatchObject({
    error: { code: 'RUNTIME_ERROR', message: 'command failed' },
  })
  expect(plane.commands.size).toBe(1)
  expect(plane.jobs.size).toBe(1)
})
