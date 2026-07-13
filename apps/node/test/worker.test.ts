import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { FakeAgentRuntime } from '@kriyan/agent-runtime'
import type { AgentRuntime } from '@kriyan/agent-runtime'
import { deriveNodeHealth } from '@kriyan/convex-client'

import type { NodeConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'
import { MemoryControlPlane } from './memory-plane'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture(
  nodeId = 'node:test',
  runtime: AgentRuntime = new FakeAgentRuntime({ now: () => 1_000 }),
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kriyan-node-'))
  directories.push(dataDir)
  const plane = new MemoryControlPlane()
  await plane.submit({
    installationId: 'installation:test',
    commandId: 'command:test',
    idempotencyKey: 'idem:test',
    input: 'remind me to practice Korean',
    maxAttempts: 3,
  })
  const config: NodeConfig = {
    convexUrl: 'http://localhost:3210',
    installationId: 'installation:test',
    nodeId,
    displayName: nodeId,
    protocolVersion: '1',
    dataDir,
    leaseDurationMs: 300,
    pollIntervalMs: 10,
    heartbeatIntervalMs: 100,
    shutdownGraceMs: 250,
    timezone: 'UTC',
    locale: 'en-US',
    runtime: 'fake',
  }
  const logs: string[] = []
  const worker = new KriyanWorker(config, plane, runtime, {
    info: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
    error: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
  })
  await worker.register()
  return { dataDir, plane, worker, logs, config }
}

describe('Kriyan worker', () => {
  test('command becomes ordered events, one reminder, and exactly-once completion', async () => {
    const { plane, worker } = await fixture()
    expect(await worker.runOnce()).toBe(true)
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
    expect([...plane.reminderRecords.keys()]).toEqual(['reminder:job:command:test'])
    expect(plane.events.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(plane.commands.get('command:test')?.status).toBe('completed')
  })

  test('two workers cannot double execute one command', async () => {
    const first = await fixture('node:first', new FakeAgentRuntime({ stepDelayMs: 10 }))
    const secondData = await mkdtemp(join(tmpdir(), 'kriyan-node-'))
    directories.push(secondData)
    const second = new KriyanWorker(
      { ...first.config, nodeId: 'node:second', dataDir: secondData },
      first.plane,
      new FakeAgentRuntime(),
    )
    await second.register()
    const results = await Promise.all([first.worker.runOnce(), second.runOnce()])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(first.plane.reminderRecords.size).toBe(1)
  })

  test('completion disconnect retries from durable boundary without duplicate effect', async () => {
    const { plane, worker, config } = await fixture()
    plane.completeFailures = 1
    expect(await worker.runOnce()).toBe(true)
    expect(plane.reminderRecords.size).toBe(1)
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
  })

  test('lease loss aborts the session and does not commit a reminder', async () => {
    const { plane, worker } = await fixture(
      'node:test',
      new FakeAgentRuntime({ now: () => 1_000, stepDelayMs: 180 }),
    )
    plane.renewFailure = 'not_lease_owner'
    await expect(worker.runOnce()).rejects.toThrow('lease renewal rejected')
    expect(plane.reminderRecords.size).toBe(0)
  })

  test('network disconnect backs off and reconnects to finish queued work', async () => {
    const { plane, worker } = await fixture()
    plane.claimFailures = 1
    const controller = new AbortController()
    const running = worker.run(controller.signal)
    for (let count = 0; count < 100; count += 1) {
      if (plane.jobs.get('job:command:test')?.status === 'succeeded') break
      await Bun.sleep(10)
    }
    controller.abort()
    await running
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
    expect(plane.reminderRecords.size).toBe(1)
  })

  test('remote cancellation aborts a running session before product output', async () => {
    const { plane, worker } = await fixture(
      'node:test',
      new FakeAgentRuntime({ now: () => 1_000, stepDelayMs: 180 }),
    )
    const running = worker.runOnce()
    await Bun.sleep(50)
    plane.commands.get('command:test')!.status = 'cancelled'
    await expect(running).rejects.toThrow('cancelled')
    expect(plane.reminderRecords.size).toBe(0)
  })

  test('graceful drain aborts an active run and reconciles it before returning', async () => {
    const { plane, worker } = await fixture(
      'node:test',
      new FakeAgentRuntime({ now: () => 1_000, stepDelayMs: 20 }),
    )
    const active = worker.runOnce()
    await Bun.sleep(10)
    await worker.drain()
    await expect(active).rejects.toThrow('service shutdown')
    expect(plane.reminderRecords.size).toBe(0)
    expect(plane.jobs.get('job:command:test')?.status).toBe('queued')
    expect(plane.publicErrors).toContain('NODE_SHUTDOWN')
  })

  test('normal events and logs exclude raw command and secret-shaped input', async () => {
    const { dataDir, plane, worker, logs } = await fixture()
    plane.commands.get('command:test')!.input = 'remind me API_KEY=super-secret-value'
    await worker.runOnce()
    const transcript = await readFile(
      join(dataDir, 'runs', encodeURIComponent('run:job:command:test:1'), 'transcript.jsonl'),
      'utf8',
    )
    const publicData = `${JSON.stringify(plane.events)}\n${logs.join('\n')}\n${transcript}`
    expect(publicData).not.toContain('super-secret-value')
    expect(publicData).not.toContain('API_KEY=')
  })

  test('response loss after event, effect, and completion commits reconciles without duplicates', async () => {
    const { plane, worker } = await fixture()
    plane.eventResponseLosses = 1
    plane.reminderResponseLosses = 1
    plane.completeResponseLosses = 1
    expect(await worker.runOnce()).toBe(true)
    expect(plane.events).toHaveLength(3)
    expect(plane.reminderRecords.size).toBe(1)
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
  })

  test('provider diagnostics are redacted locally and only stable codes cross Convex', async () => {
    const secretError = new Error(
      'Bearer auth-token API_KEY=super-secret /Users/alice/private headers={authorization:x} body={secret}',
    )
    const runtime: AgentRuntime = {
      async createSession() {
        return {
          async run() {
            throw secretError
          },
          async dispose() {},
        }
      },
    }
    const { plane, worker, logs } = await fixture('node:test', runtime)
    await expect(worker.runOnce()).rejects.toThrow()
    expect(plane.publicErrors).toEqual(['RUNTIME_FAILED'])
    const evidence = `${JSON.stringify(plane.publicErrors)}\n${logs.join('\n')}`
    expect(evidence).not.toContain('auth-token')
    expect(evidence).not.toContain('super-secret')
    expect(evidence).not.toContain('/Users/alice')
    expect(evidence).not.toContain('authorization')
  })

  test('adversarial provider text is bounded and redacted before event upload', async () => {
    const runtime: AgentRuntime = {
      async createSession() {
        return {
          async run(_request, emit) {
            await emit({
              type: 'message',
              data: `API_KEY=key-secret Bearer bearer-secret headers={authorization:header-secret} HTTP body=body-secret sk-abcdefghijk /home/alice/private ${'x'.repeat(3_000)}`,
            })
            return { products: [], summary: 'done' }
          },
          async dispose() {},
        }
      },
    }
    const { plane, worker } = await fixture('node:test', runtime)
    expect(await worker.runOnce()).toBe(true)
    const uploaded = plane.events.map((event) => event.data).join('\n')
    expect(uploaded.length).toBeLessThanOrEqual(2_048)
    expect(uploaded).not.toContain('key-secret')
    expect(uploaded).not.toContain('bearer-secret')
    expect(uploaded).not.toContain('header-secret')
    expect(uploaded).not.toContain('body-secret')
    expect(uploaded).not.toContain('sk-abcdefghijk')
    expect(uploaded).not.toContain('/home/alice/private')
  })

  test('corrupt or truncated checkpoint is quarantined and never replays effects', async () => {
    const { dataDir, plane, worker } = await fixture()
    const runDir = join(dataDir, 'runs', encodeURIComponent('run:job:command:test:1'))
    await mkdir(runDir, { recursive: true })
    await writeFile(join(runDir, 'checkpoint.json'), '{"version":2,"truncated":', 'utf8')
    await expect(worker.runOnce()).rejects.toThrow('quarantined')
    expect(plane.reminderRecords.size).toBe(0)
    expect(plane.publicErrors).toEqual(['CHECKPOINT_CORRUPT'])
    expect((await readdir(runDir)).some((name) => name.startsWith('checkpoint.json.corrupt.'))).toBe(true)
  })

  test('a retrying job explicitly reopens its persisted Pi session on the next attempt', async () => {
    const sessionFile = '/tmp/kriyan-test-pi-session.jsonl'
    const firstRuntime: AgentRuntime = {
      async createSession() {
        return {
          sessionFile,
          async run() {
            throw new Error('retry this run')
          },
          async dispose() {},
        }
      },
    }
    const { plane, worker, config } = await fixture('node:test', firstRuntime)
    await expect(worker.runOnce()).rejects.toThrow('retry this run')
    expect(plane.jobs.get('job:command:test')?.status).toBe('queued')
    const resumePaths: Array<string | undefined> = []
    const resumedRuntime: AgentRuntime = {
      async createSession(_runId, _workspace, resumeSessionFile) {
        resumePaths.push(resumeSessionFile)
        return {
          async run() {
            return { products: [], summary: 'resumed' }
          },
          async dispose() {},
        }
      },
    }
    const restarted = new KriyanWorker(config, plane, resumedRuntime)
    await restarted.register()
    expect(await restarted.runOnce()).toBe(true)
    expect(resumePaths).toEqual([sessionFile])
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
  })

  test('independent heartbeat continues through more than 60 seconds of equivalent active runtime', async () => {
    let clock = 0
    let release!: () => void
    const runtimeDone = new Promise<void>((resolve) => (release = resolve))
    const runtime: AgentRuntime = {
      async createSession() {
        return {
          async run(_request, emit) {
            await emit({ type: 'status', data: 'long_run' })
            await runtimeDone
            return { products: [], summary: 'done' }
          },
          async dispose() {},
        }
      },
    }
    const dataDir = await mkdtemp(join(tmpdir(), 'kriyan-heartbeat-'))
    directories.push(dataDir)
    const plane = new MemoryControlPlane(() => clock)
    await plane.submit({
      installationId: 'installation:test', commandId: 'command:test',
      idempotencyKey: 'idem:test', input: 'long run', maxAttempts: 3,
    })
    const config: NodeConfig = {
      convexUrl: 'http://localhost:3210', installationId: 'installation:test',
      nodeId: 'node:heartbeat', displayName: 'heartbeat', protocolVersion: '1',
      dataDir, leaseDurationMs: 30_000, pollIntervalMs: 1_000,
      heartbeatIntervalMs: 20_000, shutdownGraceMs: 250,
      timezone: 'UTC', locale: 'en-US', runtime: 'fake',
    }
    const controller = new AbortController()
    const worker = new KriyanWorker(config, plane, runtime, undefined, {
      sleep: async (milliseconds) => {
        if (milliseconds === config.shutdownGraceMs) {
          await Bun.sleep(milliseconds)
          return
        }
        clock += milliseconds
        await Bun.sleep(0)
        if (clock >= 120_000) release()
      },
    })
    const running = worker.run(controller.signal)
    for (let count = 0; count < 100 && plane.jobs.get('job:command:test')?.status !== 'succeeded'; count += 1) {
      await Bun.sleep(1)
    }
    controller.abort()
    await running
    const node = plane.nodeRecords.get('node:heartbeat')!
    expect(clock).toBeGreaterThan(60_000)
    expect(node.revision).toBeGreaterThan(2)
    expect(deriveNodeHealth(node, clock).status).toBe('online')
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
  })

  test('bounded drain returns for a non-cooperative runtime', async () => {
    const runtime: AgentRuntime = {
      async createSession() {
        return {
          async run() {
            await new Promise(() => undefined)
            throw new Error('unreachable')
          },
          async dispose() {},
        }
      },
    }
    const { worker } = await fixture('node:test', runtime)
    void worker.runOnce()
    await Bun.sleep(10)
    const startedAt = Date.now()
    await worker.drain()
    expect(Date.now() - startedAt).toBeLessThan(500)
  })
})
