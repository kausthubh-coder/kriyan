import type { AgentRuntime } from '@kriyan/agent-runtime'
import { FakeAgentRuntime } from '@kriyan/agent-runtime'

import type { NodeConfig } from '../src/config'
import { runManagedWorker } from '../src/main'
import { KriyanWorker } from '../src/worker'
import { CrashPlane } from './crash-plane'

const dataDir = Bun.argv[2]
const statePath = Bun.argv[3]
const mode = Bun.argv[4]
if (dataDir === undefined || statePath === undefined || mode === undefined) {
  throw new Error('signal fixture arguments are required')
}

const plane = await CrashPlane.open(statePath)
if (!plane.commands.has('command:signal')) {
  await plane.submit({
    installationId: 'installation:qualified-sandpiper-726-signal',
    commandId: 'command:signal',
    idempotencyKey: 'idem:signal',
    input: 'non-cooperative',
    maxAttempts: 3,
  })
}
const runtime: AgentRuntime = mode === 'noncooperative' || mode === 'cooperative-signal'
  ? {
      async createSession() {
        return {
          async run(request) {
            console.log('RUNTIME_ACTIVE')
            if (mode === 'cooperative-signal') {
              await new Promise<void>((_resolve, reject) => {
                const cancelled = (): void => reject(new DOMException('cancelled', 'AbortError'))
                if (request.signal.aborted) cancelled()
                else request.signal.addEventListener('abort', cancelled, { once: true })
              })
            }
            await new Promise(() => undefined)
            throw new Error('unreachable')
          },
          async dispose() {
            if (mode === 'noncooperative') await new Promise(() => undefined)
          },
        }
      },
    }
  : new FakeAgentRuntime({ now: () => 1_000 })
const config: NodeConfig = {
  convexUrl: 'http://localhost:3210',
  installationId: 'installation:qualified-sandpiper-726-signal',
  nodeId: 'node:signal',
  displayName: 'signal fixture',
  protocolVersion: '1',
  dataDir,
  leaseDurationMs: 300,
  pollIntervalMs: 10,
  heartbeatIntervalMs: 100,
  shutdownGraceMs: 150,
  timezone: 'UTC',
  locale: 'en-US',
  runtime: 'fake',
}
const worker = new KriyanWorker(config, plane, runtime)
if (mode === 'noncooperative' || mode === 'cooperative-signal') {
  await runManagedWorker(worker)
  console.log(`STOPPED ${JSON.stringify(await plane.snapshot())}`)
} else {
  await worker.register()
  await worker.runOnce()
  console.log(`RESTARTED ${JSON.stringify(await plane.snapshot())}`)
}
