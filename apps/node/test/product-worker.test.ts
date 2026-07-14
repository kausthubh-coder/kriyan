import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'
import type {
  WorkerOperation,
  WorkerOperationInputMap,
  WorkerOperationResultMap,
  WorkerEffectReceiptResult,
} from '@kriyan/contracts'
import type { AgentRuntime } from '@kriyan/agent-runtime'
import type { Job } from '@kriyan/convex-client'
import type { WorkerContractClient } from '@kriyan/convex-client'

import type { NodeConfig } from '../src/config'
import { KriyanWorker } from '../src/worker'
import { MemoryControlPlane } from './memory-plane'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

class ProductPlane extends MemoryControlPlane implements WorkerContractClient {
  readonly receipts = new Map<string, WorkerEffectReceiptResult>()
  readonly effectCheckpoints = new Set<string>()
  readonly assistantMessages: string[] = []
  piSessionRef: string | undefined
  sessionRevision = 0

  override async claimJob(...input: Parameters<MemoryControlPlane['claimJob']>) {
    const claim = await super.claimJob(...input)
    if (claim === null) return null
    const job = this.jobs.get(claim.job.jobId)!
    job.leaseToken = `lease:${job.jobId}:${job.attempt}`
    return { ...claim, job: { ...job } }
  }

  seed(ordinal: number): void {
    const commandId = `command:agent:${ordinal}`
    const jobId = `job:${commandId}`
    this.commands.set(commandId, {
      installationId: 'installation:test',
      idempotencyKey: `intent:${ordinal}`,
      input: `turn ${ordinal}`,
      status: 'accepted',
    })
    this.jobs.set(jobId, {
      installationId: 'installation:test',
      jobId,
      commandId,
      contractVersion: 'kriyan.contracts.v1',
      kind: 'agent.turn.v1',
      requiredCapabilities: ['agent.chat.v1'],
      threadId: 'thread:test',
      turnId: `turn:thread:test:${ordinal}`,
      turnOrdinal: ordinal,
      agentRevisionId: 'agent-revision:test:1',
      assistantMessageId: `message:thread:test:${ordinal}:assistant`,
      status: 'queued',
      attempt: 0,
      maxAttempts: 3,
      revision: 0,
      createdAt: ordinal,
      updatedAt: ordinal,
    })
  }

  override async completeRun(
    installationId: string,
    nodeId: string,
    job: Job,
    run: Parameters<MemoryControlPlane['completeRun']>[3],
    assistantContent?: string,
  ) {
    if (assistantContent !== undefined) this.assistantMessages.push(assistantContent)
    return await super.completeRun(installationId, nodeId, job, run)
  }

  async invoke<Operation extends WorkerOperation>(
    operation: Operation,
    input: WorkerOperationInputMap[Operation],
  ): Promise<WorkerOperationResultMap[Operation]> {
    const value = input as Record<string, unknown>
    const job = typeof value.jobId === 'string' ? this.jobs.get(value.jobId) : undefined
    if (operation === 'execution.context.read') {
      if (job === undefined) throw new Error('missing test job')
      const ordinal = job.turnOrdinal!
      const now = ordinal
      return {
        command: {
          installationId: job.installationId,
          commandId: job.commandId,
          idempotencyKey: `intent:${ordinal}`,
          input: `turn ${ordinal}`,
          contractVersion: 'kriyan.contracts.v1',
          kind: 'agent.message.submit',
          threadId: job.threadId,
          turnId: job.turnId,
          turnOrdinal: ordinal,
          agentRevisionId: job.agentRevisionId,
          status: 'accepted',
          revision: 0,
          createdAt: now,
          updatedAt: now,
        },
        job: {
          ...job,
          createdAt: job.createdAt ?? now,
          updatedAt: job.updatedAt ?? now,
        },
        agentRevision: {
          agentRevisionId: 'agent-revision:test:1',
          agentId: 'agent:test',
          ordinal: 1,
          displayName: 'Kriyan',
          systemPrompt: 'Help the owner.',
          toolCapabilities: ['task.write', 'reminder.write', 'note.write', 'source.write', 'knowledge.write'],
          createdAt: 1,
        },
        thread: {
          threadId: 'thread:test',
          agentId: 'agent:test',
          preferredNodeId: 'node:test',
          piSessionRef: this.piSessionRef,
          sessionRevision: this.sessionRevision,
        },
        messages: [{
          messageId: `message:user:${ordinal}`,
          threadId: 'thread:test',
          turnId: job.turnId!,
          turnOrdinal: ordinal,
          role: 'user',
          state: 'active',
          content: `turn ${ordinal}`,
          origin: 'client',
          agentRevisionId: job.agentRevisionId!,
          createdAt: now,
          updatedAt: now,
        }],
        messagesTruncated: false,
        effectReceipts: [...this.receipts.values()].filter((receipt) => receipt.jobId === job.jobId),
      } as WorkerOperationResultMap[Operation]
    }
    if (operation.startsWith('effect.') && operation.endsWith('.commit')) {
      if (job === undefined) throw new Error('missing effect job')
      const effectId = String(value.effectId)
      const existing = this.receipts.get(effectId)
      if (existing !== undefined) {
        return { ok: true, duplicate: true, receipt: existing, jobRevision: job.revision } as WorkerOperationResultMap[Operation]
      }
      const family = operation.split('.')[1] as WorkerEffectReceiptResult['family']
      job.revision += 1
      const receipt: WorkerEffectReceiptResult = {
        effectId,
        jobId: job.jobId,
        family,
        action: String(value.action),
        targetId: String(value.taskId ?? value.reminderId ?? value.noteId ?? value.sourceRefId ?? value.knowledgeDocumentId),
        inputHash: `sha256:${effectId}`,
        targetRevision: 1,
        created: true,
        createdAt: Date.now(),
      }
      this.receipts.set(effectId, receipt)
      return { ok: true, duplicate: false, receipt, jobRevision: job.revision } as WorkerOperationResultMap[Operation]
    }
    if (operation === 'effect.checkpoint') {
      if (job === undefined) throw new Error('missing checkpoint job')
      const checkpoint = String(value.checkpoint)
      if (!this.effectCheckpoints.has(checkpoint)) {
        this.effectCheckpoints.add(checkpoint)
        job.revision += 1
      }
      return { ok: true, revision: job.revision } as WorkerOperationResultMap[Operation]
    }
    if (operation === 'session.checkpoint') {
      if (job === undefined) throw new Error('missing session job')
      this.piSessionRef = String(value.piSessionRef)
      this.sessionRevision += 1
      job.revision += 1
      return { ok: true, revision: job.revision } as WorkerOperationResultMap[Operation]
    }
    throw new Error(`unexpected worker operation: ${operation}`)
  }

  async upsertSourceExcerpt(input: WorkerOperationInputMap['memory.source-excerpt.upsert']) {
    return await this.invoke('memory.source-excerpt.upsert', input)
  }
  async upsertSourceExtraction(input: WorkerOperationInputMap['memory.source-extraction.upsert']) {
    return await this.invoke('memory.source-extraction.upsert', input)
  }
  async recordReversibleChange(input: WorkerOperationInputMap['memory.reversible-change.record']) {
    return await this.invoke('memory.reversible-change.record', input)
  }
  async upsertMemoryFact(input: WorkerOperationInputMap['memory.fact.upsert']) {
    return await this.invoke('memory.fact.upsert', input)
  }
}

async function fixture(runtime: AgentRuntime, plane = new ProductPlane()) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kriyan-product-node-'))
  directories.push(dataDir)
  const config: NodeConfig = {
    convexUrl: 'http://localhost:3210',
    installationId: 'installation:test',
    nodeId: 'node:test',
    displayName: 'Node',
    protocolVersion: '1',
    dataDir,
    leaseDurationMs: 30_000,
    pollIntervalMs: 10,
    heartbeatIntervalMs: 1_000,
    shutdownGraceMs: 250,
    timezone: 'UTC',
    locale: 'en-US',
    runtime: 'fake',
  }
  const worker = new KriyanWorker(config, plane, runtime, undefined, { workerClient: plane })
  await worker.register()
  return { dataDir, config, plane, worker }
}

function productRuntime(calls: string[], resumePaths: Array<string | undefined>): AgentRuntime {
  return {
    async createSession(_runId, _workspace, resumeSessionFile) {
      resumePaths.push(resumeSessionFile)
      return {
        sessionFile: '/tmp/kriyan-product-session.jsonl',
        async run(request, emit) {
          calls.push(request.input)
          await emit({ type: 'message', data: 'API_KEY=secret finished safely' })
          return {
            products: [],
            summary: 'done',
            assistantContent: `assistant ${request.input}`,
            toolCalls: request.input === 'turn 1' ? [
              { tool: 'kriyan.task', input: { action: 'create', taskId: 'task:1', title: 'Practice Korean' } },
              { tool: 'kriyan.reminder', input: { action: 'create', reminderId: 'reminder:1', message: 'Practice', remindAt: 123, timezone: 'UTC' } },
              { tool: 'kriyan.note', input: { action: 'create', noteId: 'note:1', title: 'Korean', contentJson: '{"type":"doc"}', plainTextPreview: 'Korean', wordCount: 1 } },
              { tool: 'kriyan.source', input: { action: 'create', sourceRefId: 'source:1', displayName: 'Course', sourceKind: 'web' } },
              { tool: 'kriyan.knowledge', input: { action: 'create', knowledgeDocumentId: 'knowledge:1', title: 'Korean', summary: 'Project', knowledgeKind: 'project' } },
            ] : [],
          }
        },
        async dispose() {},
      }
    },
  }
}

test('agent turns commit all product effects once, stay FIFO, redact events, and resume one thread session', async () => {
  const calls: string[] = []
  const resumePaths: Array<string | undefined> = []
  const plane = new ProductPlane()
  plane.seed(1)
  plane.seed(2)
  const { worker } = await fixture(productRuntime(calls, resumePaths), plane)
  expect(await worker.runOnce()).toBe(true)
  expect(await worker.runOnce()).toBe(true)
  plane.piSessionRef = undefined
  plane.sessionRevision += 1
  plane.seed(3)
  expect(await worker.runOnce()).toBe(true)

  expect(calls).toEqual(['turn 1', 'turn 2', 'turn 3'])
  expect([...plane.receipts.values()].map((receipt) => receipt.family).sort()).toEqual([
    'knowledge', 'note', 'reminder', 'source', 'task',
  ])
  expect(plane.receipts.size).toBe(5)
  expect(plane.assistantMessages).toEqual(['assistant turn 1', 'assistant turn 2', 'assistant turn 3'])
  expect(resumePaths).toEqual([undefined, '/tmp/kriyan-product-session.jsonl', undefined])
  expect(plane.events.some((event) => event.type === 'message.delta')).toBe(true)
  expect(JSON.stringify(plane.events)).not.toContain('secret')
})

test('crash after a committed agent effect replays the receipt without rerunning Pi', async () => {
  const calls: string[] = []
  const plane = new ProductPlane()
  plane.seed(1)
  const runtime = productRuntime(calls, [])
  const { config, worker } = await fixture(runtime, plane)
  let crashed = false
  const crashing = new KriyanWorker(config, plane, runtime, undefined, {
    workerClient: plane,
    onEffectBoundary(boundary) {
      if (!crashed && boundary === 'server_committed_before_marker') {
        crashed = true
        throw new Error('simulated process crash')
      }
    },
  })
  await expect(crashing.runOnce()).rejects.toThrow('simulated process crash')
  const restarted = new KriyanWorker(config, plane, {
    async createSession() {
      throw new Error('Pi must not rerun after durable output')
    },
  }, undefined, { workerClient: plane })
  await restarted.register()
  expect(await restarted.runOnce()).toBe(true)
  expect(calls).toEqual(['turn 1'])
  expect(plane.receipts.size).toBe(5)
  expect(plane.jobs.get('job:command:agent:1')?.status).toBe('succeeded')
})

test('a missing thread-bound Pi session fails closed until the owner explicitly resets it', async () => {
  const plane = new ProductPlane()
  plane.piSessionRef = 'pi-session:missing'
  plane.sessionRevision = 1
  plane.seed(1)
  const { worker } = await fixture({
    async createSession() {
      throw new Error('a missing bound session must never silently start over')
    },
  }, plane)
  await expect(worker.runOnce()).rejects.toThrow('reset the session explicitly')
  expect(plane.publicErrors).toContain('SESSION_UNAVAILABLE')
  expect(plane.jobs.get('job:command:agent:1')?.status).toBe('failed')
})

test('remote cancellation aborts an active agent turn before any durable effect', async () => {
  const plane = new ProductPlane()
  plane.seed(1)
  const runtime: AgentRuntime = {
    async createSession() {
      return {
        async run(request) {
          await new Promise<void>((resolve) => request.signal.addEventListener('abort', () => resolve(), { once: true }))
          throw new DOMException('cancelled', 'AbortError')
        },
        async dispose() {},
      }
    },
  }
  const { config } = await fixture(runtime, plane)
  const worker = new KriyanWorker({ ...config, leaseDurationMs: 300 }, plane, runtime, undefined, {
    workerClient: plane,
  })
  const running = worker.runOnce()
  await Bun.sleep(25)
  plane.commands.get('command:agent:1')!.status = 'cancelled'
  await expect(running).rejects.toThrow('cancelled')
  expect(plane.receipts.size).toBe(0)
  expect(plane.publicErrors).toContain('RUN_CANCELLED')
})
