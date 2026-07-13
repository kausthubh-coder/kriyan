#!/usr/bin/env bun
import {
  FakeAgentRuntime,
  LocalPiSessionFactory,
  PiAgentRuntime,
} from '@kriyan/agent-runtime'
import { ConvexControlPlane } from '@kriyan/convex-client'
import { deriveNodeHealth } from '@kriyan/convex-client'

import { loadConfig } from './config'
import { KriyanWorker } from './worker'

export async function runNode(configPath: string): Promise<void> {
  const config = await loadConfig(configPath)
  const plane = new ConvexControlPlane(config.convexUrl)
  const runtime =
    config.runtime === 'fake'
      ? new FakeAgentRuntime()
      : new PiAgentRuntime(new LocalPiSessionFactory())
  const worker = new KriyanWorker(config, plane, runtime)
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
    await plane.close()
  }
}

export async function healthCheck(configPath: string): Promise<boolean> {
  const config = await loadConfig(configPath)
  const plane = new ConvexControlPlane(config.convexUrl)
  try {
    const node = (await plane.nodes(config.installationId)).find(
      (candidate) => candidate.nodeId === config.nodeId,
    )
    return node !== undefined && deriveNodeHealth(node, Date.now()).status === 'online'
  } finally {
    await plane.close()
  }
}

if (import.meta.main) {
  const healthIndex = Bun.argv.indexOf('--health-config')
  if (healthIndex >= 0) {
    const healthPath = Bun.argv[healthIndex + 1]
    if (healthPath === undefined) {
      console.error('usage: kriyan-node --health-config <path>')
      process.exit(2)
    }
    process.exit((await healthCheck(healthPath).catch(() => false)) ? 0 : 1)
  }
  const configIndex = Bun.argv.indexOf('--config')
  const configPath = configIndex >= 0 ? Bun.argv[configIndex + 1] : undefined
  if (configPath === undefined) {
    console.error('usage: kriyan-node --config <path>')
    process.exit(2)
  }
  runNode(configPath).catch((error) => {
    console.error(error instanceof Error ? error.message : 'node failed')
    process.exit(1)
  })
}
