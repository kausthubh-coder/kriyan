import { mkdir } from 'node:fs/promises'

import type {
  AgentRuntime,
  AgentRuntimeSession,
  NormalizedRuntimeEvent,
} from '@kriyan/agent-runtime'
import type {
  ControlPlane,
  Job,
  Run,
  RunEventInput,
} from '@kriyan/convex-client'
import {
  minimalProductivityRegistry,
  type EffectLinkage,
  type PreparedEffect,
} from '@kriyan/tools'

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

export type EffectBoundary =
  | 'prepared_before_commit'
  | 'server_committed_before_marker'
  | 'committed_marker_saved'

export interface WorkerOptions {
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  onHeartbeat?: () => Promise<void>
  onEffectBoundary?: (
    boundary: EffectBoundary,
    effect: PreparedEffect,
  ) => Promise<void> | void
}

interface ActiveExecution {
  job: Job
  run: Run
  checkpoint: RunCheckpoint
  controller: AbortController
  renewTimer: ReturnType<typeof setInterval> | null
  session: AgentRuntimeSession | null
  disposePromise: Promise<void> | null
  shutdownPromise: Promise<void> | null
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

async function bounded<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  const timeout = Symbol('timeout')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      promise,
      new Promise<typeof timeout>((resolve) => {
        timer = setTimeout(() => resolve(timeout), milliseconds)
      }),
    ])
    return result === timeout ? { timedOut: true } : { timedOut: false, value: result }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function errorInfo(error: unknown): {
  code:
    | 'NODE_SHUTDOWN'
    | 'RUN_CANCELLED'
    | 'LEASE_LOST'
    | 'CHECKPOINT_CORRUPT'
    | 'RUNTIME_FAILED'
  retryable: boolean
} {
  if (error instanceof ShutdownError) {
    return { code: 'NODE_SHUTDOWN', retryable: true }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'RUN_CANCELLED', retryable: false }
  }
  if (error instanceof LeaseLostError) {
    return { code: 'LEASE_LOST', retryable: true }
  }
  if (error instanceof CorruptCheckpointError) {
    return { code: 'CHECKPOINT_CORRUPT', retryable: false }
  }
  return { code: 'RUNTIME_FAILED', retryable: true }
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
export class ShutdownError extends Error {}

export class KriyanWorker {
  private readonly store: LocalRunStore
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  private stopping = false
  private active: Promise<void> | null = null
  private activeExecution: ActiveExecution | null = null
  private activeController: AbortController | null = null
  private nodeRevision = 0

  constructor(
    private readonly config: NodeConfig,
    private readonly plane: ControlPlane,
    private readonly runtime: AgentRuntime,
    private readonly logger: WorkerLogger = safeLogger,
    private readonly options: WorkerOptions = {},
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
    await this.options.onHeartbeat?.()
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
      this.activeExecution = null
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

  private effectContext(effect: PreparedEffect): {
    signal: AbortSignal
    effectId: string
    idempotencyKey: string
    linkage: EffectLinkage
    committer: ControlPlane
  } {
    return {
      signal: this.activeExecution?.controller.signal ?? new AbortController().signal,
      effectId: effect.effectId,
      idempotencyKey: effect.idempotencyKey,
      linkage: effect.linkage,
      committer: this.plane,
    }
  }

  private async persistEffect(
    checkpoint: RunCheckpoint,
    effect: PreparedEffect,
  ): Promise<RunCheckpoint> {
    const updated = {
      ...checkpoint,
      preparedEffects: { ...checkpoint.preparedEffects, [effect.effectId]: effect },
    }
    await this.store.save(updated)
    if (this.activeExecution !== null) this.activeExecution.checkpoint = updated
    return updated
  }

  private async commitPreparedEffect(
    effect: PreparedEffect,
    checkpoint: RunCheckpoint,
    reconcile: boolean,
  ): Promise<RunCheckpoint> {
    if (effect.phase === 'committed') return checkpoint
    let current = effect
    if (current.phase === 'prepared') {
      await this.options.onEffectBoundary?.('prepared_before_commit', current)
      current = { ...current, phase: 'committing' }
      checkpoint = await this.persistEffect(checkpoint, current)
    }
    const registry = minimalProductivityRegistry()
    let committed = false
    let lastError: Error | undefined
    for (let attempt = 0; attempt < 3 && !committed; attempt += 1) {
      const result = reconcile
        ? await registry.reconcile(current, this.effectContext(current))
        : await registry.commit(current, this.effectContext(current))
      if (result.ok) {
        committed = true
      } else {
        lastError = new Error(result.error?.code ?? 'effect_commit_failed')
        if (attempt < 2) await this.sleep(10)
      }
    }
    if (!committed) throw lastError ?? new Error('effect_commit_failed')
    await this.options.onEffectBoundary?.('server_committed_before_marker', current)
    current = { ...current, phase: 'committed' }
    checkpoint = await this.persistEffect(checkpoint, current)
    await this.options.onEffectBoundary?.('committed_marker_saved', current)
    return checkpoint
  }

  private async reconcilePreparedEffects(checkpoint: RunCheckpoint): Promise<RunCheckpoint> {
    let updated = checkpoint
    for (const effect of Object.values(updated.preparedEffects)) {
      updated = await this.commitPreparedEffect(effect, updated, true)
    }
    return updated
  }

  private async disposeActive(active: ActiveExecution): Promise<void> {
    if (active.disposePromise === null) {
      active.disposePromise = active.session?.dispose().catch(() => undefined) ?? Promise.resolve()
    }
    const disposed = await bounded(active.disposePromise, Math.max(50, this.config.shutdownGraceMs / 3))
    if (disposed.timedOut) {
      this.logger.error('runtime_dispose_deadline_reached', {
        errorCode: 'RUNTIME_DISPOSE_TIMEOUT',
      })
    }
  }

  private async reconcileShutdown(active: ActiveExecution): Promise<void> {
    if (active.shutdownPromise !== null) return await active.shutdownPromise
    active.shutdownPromise = (async () => {
      if (active.renewTimer !== null) {
        clearInterval(active.renewTimer)
        active.renewTimer = null
      }
      active.controller.abort()
      const requestedAt = Date.now()
      active.checkpoint = {
        ...active.checkpoint,
        shutdown: { requestedAt, phase: 'requested', reason: 'service_shutdown' },
      }
      await bounded(this.store.save(active.checkpoint), Math.max(50, this.config.shutdownGraceMs / 4))
      const command = await bounded(
        this.plane.command(this.config.installationId, active.job.commandId),
        Math.max(50, this.config.shutdownGraceMs / 4),
      )
      if (active.checkpoint.completed || (!command.timedOut && command.value?.status === 'completed')) {
        return await this.disposeActive(active)
      }
      const released = await bounded(
        this.plane.failRun(
          this.config.installationId,
          this.config.nodeId,
          active.job,
          active.run,
          'NODE_SHUTDOWN',
          true,
        ).catch(() => ({ ok: false as const, reason: 'network_error' })),
        Math.max(50, this.config.shutdownGraceMs / 3),
      )
      if (!released.timedOut && released.value.ok) {
        active.checkpoint = {
          ...active.checkpoint,
          shutdown: { requestedAt, phase: 'released', reason: 'service_shutdown' },
        }
        await bounded(this.store.save(active.checkpoint), Math.max(50, this.config.shutdownGraceMs / 4))
      }
      await this.disposeActive(active)
    })()
    await active.shutdownPromise
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
          version: 3,
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
    const active: ActiveExecution = {
      job,
      run,
      checkpoint,
      controller,
      renewTimer: null,
      session: null,
      disposePromise: null,
      shutdownPromise: null,
    }
    this.activeExecution = active
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

    active.renewTimer = setInterval(() => {
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
        active.job = job
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
      active.run = run
      checkpoint = { ...checkpoint, nextSequence: checkpoint.nextSequence + events.length }
      active.checkpoint = checkpoint
      await this.store.save(checkpoint)
    }

    let retryableFailure = false
    try {
      const hadPreparedEffects = Object.keys(checkpoint.preparedEffects).length > 0
      if (hadPreparedEffects) {
        // A durable effect always wins over later model output. Reconcile it
        // before opening Pi so a retry cannot invent a different mutation.
        checkpoint = await this.reconcilePreparedEffects(checkpoint)
      } else {
        const session = await this.runtime.createSession(
          run.runId,
          this.store.workspace(run.runId),
          checkpoint.piSessionFile,
        )
        active.session = session
        if (session.sessionFile !== undefined && checkpoint.piSessionFile !== session.sessionFile) {
          checkpoint = { ...checkpoint, piSessionFile: session.sessionFile }
          active.checkpoint = checkpoint
          await this.store.save(checkpoint)
        }
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
        if (controller.signal.aborted) {
          if (this.stopping) throw new ShutdownError('service shutdown')
          throw new DOMException('cancelled', 'AbortError')
        }

        const registry = minimalProductivityRegistry()
        for (const product of result.products) {
          const linkage: EffectLinkage = {
            installationId: this.config.installationId,
            commandId: job.commandId,
            jobId: job.jobId,
            runId: run.runId,
            attempt: job.attempt,
          }
          const effectId = `reminder:${job.jobId}`
          const idempotencyKey = `effect:${job.jobId}:reminder`
          const prepared = await registry.prepare('create_reminder', product, {
            signal: controller.signal,
            effectId,
            idempotencyKey,
            linkage,
            committer: this.plane,
          })
          if (!prepared.ok || prepared.value === undefined) {
            throw new Error('effect preparation failed')
          }
          checkpoint = await this.persistEffect(checkpoint, prepared.value)
          checkpoint = await this.commitPreparedEffect(prepared.value, checkpoint, false)
        }
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
      active.checkpoint = checkpoint
      await this.store.save(checkpoint)
      this.logger.info('run_completed', { runId: run.runId, jobId: job.jobId })
    } catch (error) {
      const effectiveError = this.stopping ? new ShutdownError('service shutdown') : leaseError ?? error
      const info = errorInfo(effectiveError)
      retryableFailure = info.retryable
      this.logger.error('run_failed', { errorCode: info.code, retryable: info.retryable })
      if (this.stopping) {
        await this.reconcileShutdown(active)
      } else if (!(error instanceof LeaseLostError) && leaseError === null) {
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
      throw effectiveError
    } finally {
      signal.removeEventListener('abort', propagateAbort)
      if (active.renewTimer !== null) {
        clearInterval(active.renewTimer)
        active.renewTimer = null
      }
      await this.disposeActive(active)
      if (checkpoint.completed || !retryableFailure) {
        await this.store.cleanupWorkspace(run.runId)
      }
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
    const active = this.activeExecution
    if (active?.renewTimer !== null && active?.renewTimer !== undefined) {
      clearInterval(active.renewTimer)
      active.renewTimer = null
    }
    this.activeController?.abort()
    active?.controller.abort()
  }

  async drain(): Promise<void> {
    this.requestStop()
    const activeExecution = this.activeExecution
    if (activeExecution !== null) await this.reconcileShutdown(activeExecution)
    const active = this.active
    if (active === null) return
    const finished = await bounded(active.catch(() => undefined), this.config.shutdownGraceMs)
    if (finished.timedOut) {
      this.logger.error('shutdown_deadline_reached', { errorCode: 'SHUTDOWN_TIMEOUT' })
    }
  }
}
