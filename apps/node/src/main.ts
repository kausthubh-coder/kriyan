#!/usr/bin/env bun
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  FakeAgentRuntime,
  LocalPiSessionFactory,
  PiAgentRuntime,
} from '@kriyan/agent-runtime'
import { ConvexControlPlane, deriveNodeHealth } from '@kriyan/convex-client'

import { loadConfig } from './config'
import { KnowledgeService } from './knowledge'
import {
  readProcessHealth,
  satisfiesProcessHealth,
  writeProcessHealth,
  type ProcessHealthExpectation,
  type ProcessHealthRecord,
} from './process-health'
import { resolveReleaseIdentity } from './release-identity'
import { KriyanWorker } from './worker'

export interface ManagedWorker {
  run(signal?: AbortSignal): Promise<void>
  requestStop(): void
}

export async function runManagedWorker(worker: ManagedWorker): Promise<void> {
  const controller = new AbortController()
  const stop = (): void => {
    worker.requestStop()
    controller.abort()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  try {
    await worker.run(controller.signal)
  } finally {
    process.off('SIGTERM', stop)
    process.off('SIGINT', stop)
  }
}

export async function runNode(configPath: string): Promise<void> {
  const config = await loadConfig(configPath)
  const plane = new ConvexControlPlane(config.convexUrl)
  const runtime =
    config.runtime === 'fake'
      ? new FakeAgentRuntime()
      : new PiAgentRuntime(new LocalPiSessionFactory())
  const startedAt = Date.now()
  const knowledge = new KnowledgeService({ vaultRoot: join(config.dataDir, 'vault') })
  await knowledge.initialize()
  const releaseId = await resolveReleaseIdentity()
  const health: ProcessHealthRecord = {
    schemaVersion: 1,
    installationId: config.installationId,
    nodeId: config.nodeId,
    processInstanceId: randomUUID(),
    releaseId,
    pid: process.pid,
    startedAt,
    heartbeatAt: startedAt,
    ready: true,
  }
  const worker = new KriyanWorker(config, plane, runtime, undefined, {
    workerClient: plane,
    assembleCitedContext: async (query, signal) => {
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
      return await knowledge.assembleCitedContext(query, 8)
    },
    onHeartbeat: async () => {
      health.heartbeatAt = Date.now()
      await writeProcessHealth(config.dataDir, health)
    },
  })
  try {
    await runManagedWorker(worker)
  } finally {
    await plane.close()
  }
}

export async function healthCheck(
  configPath: string,
  expectation: ProcessHealthExpectation = {},
): Promise<boolean> {
  const config = await loadConfig(configPath)
  const local = await readProcessHealth(config.dataDir)
  if (
    local === null ||
    local.installationId !== config.installationId ||
    local.nodeId !== config.nodeId ||
    !satisfiesProcessHealth(local, expectation)
  ) {
    return false
  }
  const plane = new ConvexControlPlane(config.convexUrl)
  try {
    const node = (await plane.nodes(config.installationId)).find(
      (candidate) => candidate.nodeId === config.nodeId,
    )
    return (
      node !== undefined &&
      deriveNodeHealth(node, expectation.observedAt ?? Date.now()).status === 'online'
    )
  } finally {
    await plane.close()
  }
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(name)
  return index >= 0 ? Bun.argv[index + 1] : undefined
}

function integerOption(name: string): number | undefined {
  const value = option(name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN
}

async function main(): Promise<number> {
  const processHealthConfig = option('--process-health-config')
  if (Bun.argv.includes('--process-health-config')) {
    if (processHealthConfig === undefined) {
      console.error('usage: kriyan-node --process-health-config <path>')
      return 2
    }
    try {
      const config = await loadConfig(processHealthConfig)
      const record = await readProcessHealth(config.dataDir)
      if (record === null) return 1
      console.log(`${record.processInstanceId}\t${record.releaseId}\t${record.heartbeatAt}`)
      return 0
    } catch {
      return 1
    }
  }
  const healthPath = option('--health-config')
  if (Bun.argv.includes('--health-config')) {
    const heartbeatAfter = integerOption('--heartbeat-after')
    const stabilityMs = integerOption('--stability-ms')
    if (
      healthPath === undefined ||
      Number.isNaN(heartbeatAfter) ||
      Number.isNaN(stabilityMs)
    ) {
      console.error(
        'usage: kriyan-node --health-config <path> [--expected-release <id>] [--not-instance <id>] [--heartbeat-after <ms>] [--stability-ms <ms>]',
      )
      return 2
    }
    return (await healthCheck(healthPath, {
      expectedRelease: option('--expected-release'),
      notInstance: option('--not-instance'),
      heartbeatAfter,
      stabilityMs,
    }).catch(() => false))
      ? 0
      : 1
  }
  const configPath = option('--config')
  if (configPath === undefined) {
    console.error('usage: kriyan-node --config <path>')
    return 2
  }
  try {
    await runNode(configPath)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'node failed')
    return 1
  }
}

if (import.meta.main) process.exitCode = await main()
