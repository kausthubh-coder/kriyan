import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { FakeAgentRuntime } from '@kriyan/agent-runtime'

import type { NodeConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'
import { MemoryControlPlane } from './memory-plane'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture(nodeId = 'node:test', runtime = new FakeAgentRuntime({ now: () => 1_000 })) {
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
    await expect(worker.runOnce()).rejects.toThrow('network disconnected')
    expect(plane.reminderRecords.size).toBe(1)
    const restarted = new KriyanWorker(config, plane, new FakeAgentRuntime({ now: () => 1_000 }))
    await restarted.register()
    expect(await restarted.runOnce()).toBe(true)
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

  test('graceful drain waits for the active run', async () => {
    const { plane, worker } = await fixture(
      'node:test',
      new FakeAgentRuntime({ now: () => 1_000, stepDelayMs: 20 }),
    )
    const active = worker.runOnce()
    await Bun.sleep(10)
    await worker.drain()
    await active
    expect(plane.jobs.get('job:command:test')?.status).toBe('succeeded')
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
})
