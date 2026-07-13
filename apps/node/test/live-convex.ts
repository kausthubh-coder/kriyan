import { FakeAgentRuntime } from '@kriyan/agent-runtime'
import { ConvexControlPlane } from '@kriyan/convex-client'

import { runCli } from '../../cli/src/cli'
import type { NodeConfig } from '../src/config'
import { loadConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'

function requiredEnvironment(name: string): string {
  const value = Bun.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`)
  return value
}

function requireUuid(value: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID`)
  }
  return value
}

function requireSourceCommit(value: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error('KRIYAN_RELEASE_ID must be a full Git SHA')
  return value
}

function fingerprint(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex').slice(0, 16)
}

function exactRepositoryCommit(): string {
  const status = Bun.spawnSync(['git', 'status', '--porcelain'])
  if (status.exitCode !== 0) throw new Error('could not inspect the live fixture checkout')
  if (status.stdout.toString().trim().length > 0) {
    throw new Error('live fixture requires a clean Git checkout')
  }
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'])
  if (revision.exitCode !== 0) throw new Error('could not resolve the live fixture revision')
  return requireSourceCommit(revision.stdout.toString().trim())
}

const convexUrl = requiredEnvironment('CONVEX_URL')
const deploymentName = requiredEnvironment('KRIYAN_DEPLOYMENT_NAME')
const envFile = requiredEnvironment('KRIYAN_ENV_FILE')
const installationId = requireUuid(
  requiredEnvironment('KRIYAN_INSTALLATION_ID'),
  'KRIYAN_INSTALLATION_ID',
)
const nodeId = requiredEnvironment('KRIYAN_NODE_ID')
const releaseId = requireSourceCommit(requiredEnvironment('KRIYAN_RELEASE_ID'))
const repositoryCommit = exactRepositoryCommit()
if (releaseId !== repositoryCommit) {
  throw new Error('KRIYAN_RELEASE_ID does not match the clean checkout')
}

const fixture = `live-${crypto.randomUUID()}`
let commandId = `command:${fixture}`
let runId = `run:job:${commandId}:1`
const dataDir = `/tmp/kriyan-${fixture}`
const configPath = `${dataDir}/node.json`
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
  const node = (await plane.nodes(installationId)).find((candidate) => candidate.nodeId === nodeId)
  if (command?.status !== 'completed') throw new Error(`unexpected command status: ${command?.status}`)
  if (reminders.length !== 1) throw new Error(`expected one reminder, received ${reminders.length}`)
  if (node === undefined || node.status !== 'online') throw new Error('live node heartbeat was not observable')
  if (events.some((event, index) => event.sequence !== index + 1)) {
    throw new Error('live events were not ordered')
  }
  if (
    typeof command.createdAt !== 'number' ||
    typeof command.updatedAt !== 'number' ||
    typeof node.lastHeartbeatAt !== 'number' ||
    events.some((event) => typeof event.createdAt !== 'number') ||
    reminders.some((reminder) => typeof reminder.createdAt !== 'number')
  ) {
    throw new Error('live evidence is missing server timestamps')
  }
  console.log(
    JSON.stringify({
      evidenceVersion: 1,
      ok: true,
      deploymentName,
      installationFingerprint: fingerprint(installationId),
      releaseId,
      command: {
        commandId,
        jobId: submission.jobId,
        runId,
        status: command.status,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt,
      },
      events: events.map((event) => ({
        sequence: event.sequence,
        type: event.type,
        createdAt: event.createdAt,
      })),
      reminder: {
        reminderId: reminders[0]!.reminderId,
        createdAt: reminders[0]!.createdAt,
      },
      node: {
        nodeFingerprint: fingerprint(nodeId),
        status: node.status,
        heartbeatAt: node.lastHeartbeatAt,
      },
    }),
  )
} finally {
  await plane.close()
  const deleted = await cleanup()
  const deletedSecondPass = await cleanup()
  if (deletedSecondPass !== 0) throw new Error('fixture cleanup was not idempotent')
  await Bun.$`rm -rf ${dataDir}`.quiet()
  console.log(JSON.stringify({
    cleanup: true,
    installationFingerprint: fingerprint(installationId),
    deleted,
    deletedSecondPass,
  }))
}
