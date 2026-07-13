import { FakeAgentRuntime } from '@kriyan/agent-runtime'
import { ConvexControlPlane } from '@kriyan/convex-client'

import { runCli } from '../../cli/src/cli'
import type { NodeConfig } from '../src/config'
import { loadConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'

const convexUrl = Bun.env.CONVEX_URL
if (convexUrl === undefined) throw new Error('CONVEX_URL is required')

const fixture = `qualified-sandpiper-726-node-r3-${crypto.randomUUID()}`
const installationId = `installation:${fixture}`
let commandId = `command:${fixture}`
const nodeId = `node:${fixture}`
let runId = `run:job:${commandId}:1`
const dataDir = `/tmp/kriyan-${fixture}`
const configPath = `${dataDir}/node.json`
const deploymentName = 'qualified-sandpiper-726'
const envFile = Bun.env.KRIYAN_ENV_FILE ?? '.env.local'
const plane = new ConvexControlPlane(convexUrl)

async function cleanup(): Promise<number> {
  let deleted = 0
  for (let count = 0; count < 64; count += 1) {
    const input = JSON.stringify({
      deploymentName,
      installationId,
      confirmation: 'RESET_KRIYAN_DEV',
      batchSize: 64,
    })
    const process = Bun.spawn(
      ['bunx', 'convex', 'run', '--env-file', envFile, 'dev:resetInstallation', input],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const output = await new Response(process.stdout).text()
    const error = await new Response(process.stderr).text()
    if ((await process.exited) !== 0) throw new Error(`fixture cleanup failed: ${error.trim()}`)
    const result = JSON.parse(output) as { deleted: number; done: boolean }
    deleted += result.deleted
    if (result.done) return deleted
  }
  throw new Error('fixture cleanup did not converge')
}

try {
  const cliOutput: string[] = []
  const io = {
    out: (value: string) => cliOutput.push(value),
    err: (value: string) => {
      throw new Error(`live CLI failed: ${value}`)
    },
  }
  if (
    (await runCli(
      [
        'setup', '--convex-url', convexUrl,
        '--installation-id', installationId, '--node-id', nodeId,
        '--display-name', 'Round 3 live fixture', '--data-dir', dataDir,
        '--config', configPath,
      ],
      { io },
    )) !== 0 ||
    (await runCli(['pair', '--config', configPath], { io })) !== 0 ||
    (await runCli(
      [
        'submit', '--text', 'remind me to practice Korean',
        '--idempotency-key', `idempotency:${fixture}`, '--config', configPath,
      ],
      { io, now: () => Number(fixture.length) },
    )) !== 0
  ) {
    throw new Error('live CLI returned a nonzero exit code')
  }
  const submission = JSON.parse(cliOutput.at(-1)!) as { commandId: string; jobId: string }
  const config: NodeConfig = await loadConfig(configPath)
  commandId = submission.commandId
  runId = `run:${submission.jobId}:1`
  const worker = new KriyanWorker(config, plane, new FakeAgentRuntime({ now: () => 1_750_000_000_000 }))
  await worker.register()
  if (!(await worker.runOnce())) throw new Error('live worker did not claim the submitted job')
  const command = await plane.command(installationId, commandId)
  const reminders = await plane.reminders(installationId)
  const events = await plane.runEvents(installationId, runId)
  if (command?.status !== 'completed') throw new Error(`unexpected command status: ${command?.status}`)
  if (reminders.length !== 1) throw new Error(`expected one reminder, received ${reminders.length}`)
  if (events.some((event, index) => event.sequence !== index + 1)) {
    throw new Error('live events were not ordered')
  }
  console.log(
    JSON.stringify({
      ok: true,
      fixture,
      installationId,
      jobId: submission.jobId,
      commandStatus: command.status,
      reminderCount: reminders.length,
      eventCount: events.length,
    }),
  )
} finally {
  await plane.close()
  const deleted = await cleanup()
  await Bun.$`rm -rf ${dataDir}`.quiet()
  console.log(JSON.stringify({ cleanup: true, installationId, deleted }))
}
