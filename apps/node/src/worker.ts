import { mkdir } from 'node:fs/promises'

import type {
  AgentRuntime,
  NormalizedRuntimeEvent,
} from '@kriyan/agent-runtime'
import type {
  ControlPlane,
  Job,
  Run,
  RunEventInput,
} from '@kriyan/convex-client'
import { minimalProductivityRegistry } from '@kriyan/tools'

import type { NodeConfig } from './config'
import { LocalRunStore, type RunCheckpoint } from './store'

export interface WorkerLogger {
  info(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

const safeLogger: WorkerLogger = {
  info(event, fields = {}) {
    console.log(JSON.stringify({ level: 'info', event, ...fields }))
  },
  error(event, fields = {}) {
    console.error(JSON.stringify({ level: 'error', event, ...fields }))
  },
}

function publicError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'run cancelled'
  return error instanceof Error ? error.message.slice(0, 1_024) : 'run failed'
}

export class LeaseLostError extends Error {}

export class KriyanWorker {
  private readonly store: LocalRunStore
  private stopping = false
  private active: Promise<void> | null = null
  private nodeRevision = 0

  constructor(
    private readonly config: NodeConfig,
    private readonly plane: ControlPlane,
    private readonly runtime: AgentRuntime,
    private readonly logger: WorkerLogger = safeLogger,
  ) {
    this.store = new LocalRunStore(config.dataDir)
  }

  async register(): Promise<void> {
    await mkdir(this.config.dataDir, { recursive: true, mode: 0o700 })
    const result = await this.plane.registerNode({
      installationId: this.config.installationId,
      nodeId: this.config.nodeId,
      displayName: this.config.displayName,
      capabilities: ['reminders'],
      protocolVersion: this.config.protocolVersion,
    })
    this.nodeRevision = result.node.revision
    this.logger.info('node_registered', { created: result.created, nodeId: this.config.nodeId })
  }

  async heartbeat(): Promise<void> {
    const result = await this.plane.heartbeatNode(
      this.config.installationId,
      this.config.nodeId,
      this.nodeRevision,
    )
    if (!result.ok) throw new Error(`heartbeat rejected: ${result.reason}`)
    this.nodeRevision = result.revision
  }

  async runOnce(): Promise<boolean> {
    if (this.stopping || this.active !== null) return false
    const claim = await this.plane.claimJob(
      this.config.installationId,
      this.config.nodeId,
      this.config.leaseDurationMs,
    )
    if (claim === null) return false
    this.active = this.execute(claim.job).finally(() => {
      this.active = null
    })
    await this.active
    return true
  }

  private async execute(claimedJob: Job): Promise<void> {
    let job = claimedJob
    const started = await this.plane.startRun(
      this.config.installationId,
      this.config.nodeId,
      job,
    )
    if (!started.ok) throw new LeaseLostError(`start rejected: ${started.reason}`)
    job = started.job
    let run: Run = started.run
    await this.store.prepare(run.runId)
    let checkpoint: RunCheckpoint =
      (await this.store.load(run.runId)) ?? {
        jobId: job.jobId,
        runId: run.runId,
        commandId: job.commandId,
        attempt: job.attempt,
        nextSequence: run.revision + 1,
        effectCommitted: false,
        completed: false,
      }
    await this.store.save(checkpoint)

    const command = await this.plane.command(this.config.installationId, job.commandId)
    if (command === null) throw new Error('claimed job command is missing')
    if (command.status === 'cancelled') throw new DOMException('cancelled', 'AbortError')

    const controller = new AbortController()
    let leaseError: Error | null = null
    let serialized = Promise.resolve()
    const withPlane = async <T>(operation: () => Promise<T>): Promise<T> => {
      const before = serialized
      let release!: () => void
      serialized = new Promise<void>((resolve) => (release = resolve))
      await before
      try {
        return await operation()
      } finally {
        release()
      }
    }

    const renew = setInterval(() => {
      void withPlane(async () => {
        const currentCommand = await this.plane.command(
          this.config.installationId,
          job.commandId,
        )
        if (currentCommand?.status === 'cancelled') {
          controller.abort()
          return
        }
        const result = await this.plane.renewLease(
          this.config.installationId,
          this.config.nodeId,
          job,
          this.config.leaseDurationMs,
        )
        if (!result.ok) {
          leaseError = new LeaseLostError(`lease renewal rejected: ${result.reason}`)
          controller.abort()
          return
        }
        job = { ...job, revision: result.revision }
      }).catch((error) => {
        leaseError = error instanceof Error ? error : new Error('lease renewal failed')
        controller.abort()
      })
    }, Math.max(100, Math.floor(this.config.leaseDurationMs / 3)))

    const pending: NormalizedRuntimeEvent[] = []
    const flush = async (): Promise<void> => {
      if (pending.length === 0) return
      const batch = pending.splice(0, 16)
      const events: RunEventInput[] = batch.map((event, index) => ({
        eventId: `event:${run.runId}:${checkpoint.nextSequence + index}`,
        sequence: checkpoint.nextSequence + index,
        type: event.type,
        data: event.data,
      }))
      const result = await withPlane(() =>
        this.plane.appendEvents(
          this.config.installationId,
          this.config.nodeId,
          job,
          run,
          events,
        ),
      )
      if (!result.ok) throw new LeaseLostError(`event append rejected: ${result.reason}`)
      run = { ...run, revision: result.revision }
      checkpoint = { ...checkpoint, nextSequence: checkpoint.nextSequence + events.length }
      await this.store.save(checkpoint)
    }

    const session = await this.runtime.createSession(run.runId, this.store.workspace(run.runId))
    try {
      const result = await session.run(
        {
          runId: run.runId,
          input: command.input,
          workspace: this.store.workspace(run.runId),
          signal: controller.signal,
        },
        async (event) => {
          await this.store.appendLocalEvent(run.runId, event)
          pending.push(event)
          if (pending.length >= 8) await flush()
        },
      )
      await flush()
      if (leaseError !== null) throw leaseError

      const registry = minimalProductivityRegistry()
      for (const product of result.products) {
        const toolResult = await registry.execute('create_reminder', product, {
          runId: run.runId,
          signal: controller.signal,
        })
        if (!toolResult.ok) throw new Error(toolResult.error?.message ?? 'reminder rejected')
        await withPlane(() =>
          this.plane.createReminder({
            installationId: this.config.installationId,
            reminderId: `reminder:${job.jobId}`,
            idempotencyKey: `effect:${job.jobId}:reminder`,
            message: product.message,
            remindAt: product.remindAt,
            timezone: product.timezone,
          }),
        )
        checkpoint = { ...checkpoint, effectCommitted: true }
        await this.store.save(checkpoint)
      }
      const completed = await withPlane(() =>
        this.plane.completeRun(
          this.config.installationId,
          this.config.nodeId,
          job,
          run,
        ),
      )
      if (!completed.ok) throw new LeaseLostError(`completion rejected: ${completed.reason}`)
      checkpoint = { ...checkpoint, completed: true }
      await this.store.save(checkpoint)
      this.logger.info('run_completed', { runId: run.runId, jobId: job.jobId })
    } catch (error) {
      if (!(error instanceof LeaseLostError) && leaseError === null) {
        await withPlane(() =>
          this.plane.failRun(
            this.config.installationId,
            this.config.nodeId,
            job,
            run,
            publicError(error),
            !(error instanceof DOMException && error.name === 'AbortError'),
          ),
        ).catch(() => undefined)
      }
      throw leaseError ?? error
    } finally {
      clearInterval(renew)
      await session.dispose()
      await this.store.cleanupWorkspace(run.runId)
    }
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.register()
    let failures = 0
    while (!this.stopping && !signal?.aborted) {
      try {
        await this.heartbeat()
        const worked = await this.runOnce()
        failures = 0
        if (!worked) await Bun.sleep(this.config.pollIntervalMs)
      } catch (error) {
        failures += 1
        const delay = Math.min(30_000, 250 * 2 ** Math.min(failures, 7))
        this.logger.error('worker_iteration_failed', {
          error: publicError(error),
          reconnectInMs: delay,
        })
        if (!this.stopping) await Bun.sleep(delay)
      }
    }
    await this.drain()
  }

  async drain(): Promise<void> {
    this.stopping = true
    if (this.active !== null) await this.active.catch(() => undefined)
  }
}
