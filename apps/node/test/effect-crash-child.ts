import { readFile, writeFile } from 'node:fs/promises'

import type { AgentRuntime } from '@kriyan/agent-runtime'

import type { NodeConfig } from '../src/config'
import { KriyanWorker, type EffectBoundary } from '../src/worker'
import { CrashPlane } from './crash-plane'

const dataDir = Bun.argv[2]
const statePath = Bun.argv[3]
const callsPath = Bun.argv[4]
const crashAt = Bun.argv[5] as EffectBoundary | 'none' | undefined
const message = Bun.argv[6]
if (
  dataDir === undefined ||
  statePath === undefined ||
  callsPath === undefined ||
  crashAt === undefined ||
  message === undefined
) {
  throw new Error('effect crash fixture arguments are required')
}

const plane = await CrashPlane.open(statePath)
if (!plane.commands.has('command:effect-crash')) {
  await plane.submit({
    installationId: 'installation:qualified-sandpiper-726-effect-crash',
    commandId: 'command:effect-crash',
    idempotencyKey: 'idem:effect-crash',
    input: 'prepare effect',
    maxAttempts: 5,
  })
}
const runtime: AgentRuntime = {
  async createSession() {
    const calls = Number(await readFile(callsPath, 'utf8').catch(() => '0')) + 1
    await writeFile(callsPath, String(calls), 'utf8')
    return {
      async run() {
        return {
          products: [{ kind: 'reminder', message, remindAt: 123, timezone: 'UTC' }],
          summary: 'prepared',
        }
      },
      async dispose() {},
    }
  },
}
const config: NodeConfig = {
  convexUrl: 'http://localhost:3210',
  installationId: 'installation:qualified-sandpiper-726-effect-crash',
  nodeId: 'node:effect-crash',
  displayName: 'effect crash fixture',
  protocolVersion: '1',
  dataDir,
  leaseDurationMs: 100,
  pollIntervalMs: 10,
  heartbeatIntervalMs: 50,
  shutdownGraceMs: 200,
  timezone: 'UTC',
  locale: 'en-US',
  runtime: 'fake',
}
const worker = new KriyanWorker(config, plane, runtime, undefined, {
  async onEffectBoundary(boundary) {
    if (boundary === crashAt) process.kill(process.pid, 'SIGKILL')
  },
})
await worker.register()
await worker.runOnce()
console.log(JSON.stringify(await plane.snapshot()))
