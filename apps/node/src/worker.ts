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
import { minimalProductivityRegistry, type PreparedEffect, type ReminderProduct } from '@kriyan/tools'

import type { NodeConfig } from './config'
import {
  CorruptCheckpointError,
  LocalRunStore,
  type RunCheckpoint,
} from './store'

export interface WorkerLogger {
  info(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

export interface WorkerOptions {
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

const safeLogger: WorkerLogger = {
  info(event, fields = {}) {
    console.log(JSON.stringify({ level: 'info', event, ...fields }))
  },
  error(event, fields = {}) {
    console.error(JSON.stringify({ level: 'error', event, ...fields }))
  },
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds)
    function finish(): void {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    signal?.addEventListener('abort', finish, { once: true })
  })
}

function errorInfo(error: unknown): {
  code: 'RUN_CANCELLED' | 'LEASE_LOST' | 'CHECKPOINT_CORRUPT' | 'RUNTIME_FAILED'
  message: string
  retryable: boolean
} {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'RUN_CANCELLED', message: 'run cancelled', retryable: false }
  }
  if (error instanceof LeaseLostError) {
    return { code: 'LEASE_LOST', message: 'worker lease lost', retryable: true }
  }
  if (error instanceof CorruptCheckpointError) {
    return { code: 'CHECKPOINT_CORRUPT', message: 'local checkpoint is corrupt', retryable: false }
  }
  return { code: 'RUNTIME_FAILED', message: 'runtime failed', retryable: true }
}

function safePublicEvent(event: NormalizedRuntimeEvent): NormalizedRuntimeEvent {
  if (event.type === 'error') return { type: 'error', data: 'runtime error' }
  if (event.type === 'status') {
    return /^[a-z0-9_.:-]{1,128}$/i.test(event.data)
      ? event
      : { type: 'status', data: 'runtime_update' }
  }
  if (event.type === 'tool') {
    try {
      const value = JSON.parse(event.data) as { name?: unknown; status?: unknown }
      return {
        type: 'tool',
        data: JSON.stringify({
          name: typeof value.name === 'string' ? value.name.slice(0, 128) : 'tool',
          status: typeof value.status === 'string' ? value.status.slice(0, 64) : 'updated',
        }),
      }
    } catch {
      return { type: 'tool', data: '{"name":"tool","status":"updated"}' }
    }
  }
  // Assistant text is a product-visible output. Bound each coalesced delta and
  // strip common credential/header/path/body shapes before it crosses Convex.
  const data = event.data
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:headers?|http body|response body)\s*[:=]\s*(?:\{[^}]*\}|\S+)/gi, '[redacted]')
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, '[redacted-key]')
    .replace(/(?:\/Users|\/home|\/var|\/tmp)\/[^\s"']+/g, '[redacted-path]')
    .slice(0, 2_048)
  return { type: 'message', data }
}

export class LeaseLostError extends Error {}

export class KriyanWorker {
  private readonly store: LocalRunStore
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  private stopping = false
  private active: Promise<void> | null = null
  private activeController: AbortController | null = null
  private nodeRevision = 0

  constructor(
    private readonly config: NodeConfig,
    private readonly plane: ControlPlane,
    private readonly runtime: AgentRuntime,
    private readonly logger: WorkerLogger = safeLogger,
    options: WorkerOptions = {},
  ) {
    this.store = new LocalRunStore(config.dataDir)
    this.sleep = options.sleep ?? abortableSleep
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
    // Registration is pending by contract until this first real worker heartbeat.
    await this.heartbeat()
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

  private async heartbeatLoop(signal?: AbortSignal): Promise<void> {
    while (!this.stopping && !signal?.aborted) {
      await this.sleep(this.config.heartbeatIntervalMs, signal)
      if (this.stopping || signal?.aborted) break
      try {
        await this.heartbeat()
      } catch {
        this.logger.error('heartbeat_failed', { errorCode: 'HEARTBEAT_FAILED' })
      }
    }
  }

  async runOnce(): Promise<boolean> {
    if (this.stopping || this.active !== null) return false
    const claim = await this.plane.claimJob(
      this.config.installationId,
      this.config.nodeId,
      this.config.leaseDurationMs,
    )
    if (claim === null) return false
    this.activeController = new AbortController()
    this.active = this.execute(claim.job, this.activeController.signal).finally(() => {
      this.active = null
      this.activeController = null
    })
    await this.active
    return true
  }

  private async retryCommit<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (attempt < 2) await this.sleep(10)
      }
    }
    throw lastError
  }

  private async commitEffect(
    effect: PreparedEffect<ReminderProduct>,
    checkpoint: RunCheckpoint,
  ): Promise<RunCheckpoint> {
    if (checkpoint.preparedEffects[effect.effectId]?.committed === true) return checkpoint
    let updated: RunCheckpoint = {
      ...checkpoint,
      preparedEffects: {
        ...checkpoint.preparedEffects,
        [effect.effectId]: { kind: effect.kind, committed: false },
      },
    }
    await this.store.save(updated)
    await this.retryCommit(() =>
      this.plane.createReminder({
        installationId: this.config.installationId,
        reminderId: effect.effectId,
        idempotencyKey: effect.idempotencyKey,
        message: effect.payload.message,
        remindAt: effect.payload.remindAt,
        timezone: effect.payload.timezone,
      }),
    )
    updated = {
      ...updated,
      preparedEffects: {
        ...updated.preparedEffects,
        [effect.effectId]: { kind: effect.kind, committed: true },
      },
    }
    await this.store.save(updated)
    return updated
  }

  private async execute(claimedJob: Job, signal: AbortSignal): Promise<void> {
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
    let checkpoint: RunCheckpoint
    try {
      const previous = await this.store.latestForJob(job.jobId, run.runId)
      checkpoint =
        (await this.store.load(run.runId)) ?? {
          version: 2,
          jobId: job.jobId,
          runId: run.runId,
          commandId: job.commandId,
          attempt: job.attempt,
          nextSequence: run.revision + 1,
          preparedEffects: previous?.preparedEffects ?? {},
          completed: false,
          piSessionFile: previous?.piSessionFile,
        }
    } catch (error) {
      await this.plane.failRun(
        this.config.installationId,
        this.config.nodeId,
        job,
        run,
        errorInfo(error).code,
        false,
      ).catch(() => undefined)
      throw error
    }
    await this.store.save(checkpoint)

    const command = await this.plane.command(this.config.installationId, job.commandId)
    if (command === null) throw new Error('claimed job command is missing')
    if (command.status === 'cancelled') throw new DOMException('cancelled', 'AbortError')

    const controller = new AbortController()
    const propagateAbort = (): void => controller.abort()
    signal.addEventListener('abort', propagateAbort, { once: true })
    if (signal.aborted) controller.abort()
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
      }).catch(() => {
        leaseError = new LeaseLostError('lease renewal failed')
        controller.abort()
      })
    }, Math.max(100, Math.floor(this.config.leaseDurationMs / 3)))

    const pending: NormalizedRuntimeEvent[] = []
    const flush = async (): Promise<void> => {
      if (pending.length === 0) return
      const batch = pending.slice(0, 16)
      const events: RunEventInput[] = batch.map((event, index) => ({
        eventId: `event:${run.runId}:${checkpoint.nextSequence + index}`,
        sequence: checkpoint.nextSequence + index,
        type: event.type,
        data: event.data,
      }))
      const result = await this.retryCommit(() =>
        withPlane(() =>
          this.plane.appendEvents(
            this.config.installationId,
            this.config.nodeId,
            job,
            run,
            events,
          ),
        ),
      )
      if (!result.ok) throw new LeaseLostError(`event append rejected: ${result.reason}`)
      pending.splice(0, batch.length)
      run = { ...run, revision: result.revision }
      checkpoint = { ...checkpoint, nextSequence: checkpoint.nextSequence + events.length }
      await this.store.save(checkpoint)
    }

    const session = await this.runtime.createSession(
      run.runId,
      this.store.workspace(run.runId),
      checkpoint.piSessionFile,
    )
    if (session.sessionFile !== undefined && checkpoint.piSessionFile !== session.sessionFile) {
      checkpoint = { ...checkpoint, piSessionFile: session.sessionFile }
      await this.store.save(checkpoint)
    }
    try {
      const result = await session.run(
        {
          runId: run.runId,
          input: command.input,
          workspace: this.store.workspace(run.runId),
          signal: controller.signal,
        },
        async (event) => {
          const safeEvent = safePublicEvent(event)
          await this.store.appendLocalEvent(run.runId, safeEvent)
          pending.push(safeEvent)
          if (pending.length >= 8) await flush()
        },
      )
      await flush()
      if (leaseError !== null) throw leaseError
      if (controller.signal.aborted) throw new DOMException('cancelled', 'AbortError')

      const registry = minimalProductivityRegistry()
      for (const product of result.products) {
        const prepared = await registry.prepare('create_reminder', product, {
          runId: run.runId,
          signal: controller.signal,
        })
        if (!prepared.ok || prepared.value === undefined) throw new Error('effect preparation failed')
        const effect = prepared.value as PreparedEffect<ReminderProduct>
        checkpoint = await this.commitEffect(
          {
            ...effect,
            effectId: `reminder:${job.jobId}`,
            idempotencyKey: `effect:${job.jobId}:reminder`,
          },
          checkpoint,
        )
      }
      let completed
      try {
        completed = await this.retryCommit(() =>
          withPlane(() =>
            this.plane.completeRun(
              this.config.installationId,
              this.config.nodeId,
              job,
              run,
            ),
          ),
        )
      } catch (error) {
        const reconciled = await this.plane.command(this.config.installationId, job.commandId)
        if (reconciled?.status !== 'completed') throw error
        completed = { ok: true as const, revision: job.revision + 1 }
      }
      if (!completed.ok) {
        const reconciled = await this.plane.command(this.config.installationId, job.commandId)
        if (reconciled?.status !== 'completed') {
          throw new LeaseLostError(`completion rejected: ${completed.reason}`)
        }
      }
      checkpoint = { ...checkpoint, completed: true }
      await this.store.save(checkpoint)
      this.logger.info('run_completed', { runId: run.runId, jobId: job.jobId })
    } catch (error) {
      const info = errorInfo(leaseError ?? error)
      this.logger.error('run_failed', { errorCode: info.code, retryable: info.retryable })
      if (!(error instanceof LeaseLostError) && leaseError === null) {
        // Preserve already-normalized output before terminal reconciliation.
        await flush().catch(() => undefined)
        await withPlane(() =>
          this.plane.failRun(
            this.config.installationId,
            this.config.nodeId,
            job,
            run,
            info.code,
            info.retryable,
          ),
        ).catch(() => undefined)
      }
      throw leaseError ?? error
    } finally {
      signal.removeEventListener('abort', propagateAbort)
      clearInterval(renew)
      await session.dispose()
      await this.store.cleanupWorkspace(run.runId)
    }
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.register()
    const heartbeat = this.heartbeatLoop(signal)
    let failures = 0
    while (!this.stopping && !signal?.aborted) {
      try {
        const work = this.runOnce()
        let worked: boolean
        if (signal === undefined) {
          worked = await work
        } else {
          let stop!: () => void
          const stopped = new Promise<false>((resolve) => {
            stop = () => resolve(false)
            if (signal.aborted) stop()
            else signal.addEventListener('abort', stop, { once: true })
          })
          try {
            worked = await Promise.race([work, stopped])
          } finally {
            signal.removeEventListener('abort', stop)
          }
        }
        if (signal?.aborted || this.stopping) break
        failures = 0
        if (!worked) await this.sleep(this.config.pollIntervalMs, signal)
      } catch (error) {
        failures += 1
        const delay = Math.min(30_000, 250 * 2 ** Math.min(failures, 7))
        const info = errorInfo(error)
        this.logger.error('worker_iteration_failed', {
          errorCode: info.code,
          reconnectInMs: delay,
        })
        if (!this.stopping) await this.sleep(delay, signal)
      }
    }
    this.requestStop()
    await this.drain()
    await heartbeat
  }

  requestStop(): void {
    this.stopping = true
    this.activeController?.abort()
  }

  async drain(): Promise<void> {
    this.requestStop()
    const active = this.active
    if (active === null) return
    await Promise.race([
      active.catch(() => undefined),
      this.sleep(this.config.shutdownGraceMs).then(() => {
        this.logger.error('shutdown_deadline_reached', { errorCode: 'SHUTDOWN_TIMEOUT' })
      }),
    ])
  }
}
