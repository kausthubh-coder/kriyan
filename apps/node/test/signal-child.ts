import type { AgentRuntime } from '@kriyan/agent-runtime'

import type { NodeConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'
import { MemoryControlPlane } from './memory-plane'

const dataDir = Bun.argv[2]
if (dataDir === undefined) process.exit(2)

const plane = new MemoryControlPlane()
await plane.submit({
  installationId: 'installation:signal', commandId: 'command:signal',
  idempotencyKey: 'idem:signal', input: 'non-cooperative', maxAttempts: 3,
})
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
const config: NodeConfig = {
  convexUrl: 'http://localhost:3210', installationId: 'installation:signal',
  nodeId: 'node:signal', displayName: 'signal fixture', protocolVersion: '1',
  dataDir, leaseDurationMs: 300, pollIntervalMs: 10, heartbeatIntervalMs: 100,
  shutdownGraceMs: 100, timezone: 'UTC', locale: 'en-US', runtime: 'fake',
}
const controller = new AbortController()
const worker = new KriyanWorker(config, plane, runtime)
const stop = (): void => {
  worker.requestStop()
  controller.abort()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
console.log('READY')
await worker.run(controller.signal)
console.log('STOPPED')
process.exit(0)
