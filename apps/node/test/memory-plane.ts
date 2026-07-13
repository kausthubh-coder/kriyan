import type {
  ControlPlane,
  Job,
  NodeRecord,
  NodeRegistration,
  Run,
  RunEventInput,
  Transition,
} from '@kriyan/convex-client'

interface CommandRecord {
  input: string
  status: 'accepted' | 'completed' | 'failed' | 'cancelled'
}

export class MemoryControlPlane implements ControlPlane {
  readonly jobs = new Map<string, Job>()
  readonly commands = new Map<string, CommandRecord>()
  readonly runs = new Map<string, Run>()
  readonly events: RunEventInput[] = []
  readonly reminderRecords = new Map<string, { message: string; remindAt: number; timezone: string }>()
  readonly nodeRecords = new Map<string, NodeRecord>()
  completeFailures = 0
  renewFailure: string | null = null
  claimFailures = 0

  async registerNode(input: NodeRegistration) {
    const existing = this.nodeRecords.get(input.nodeId)
    if (existing !== undefined) return { created: false, node: existing }
    const node: NodeRecord = {
      ...input,
      status: 'online',
      lastHeartbeatAt: Date.now(),
      revision: 0,
    }
    this.nodeRecords.set(input.nodeId, node)
    return { created: true, node }
  }

  async heartbeatNode(_installationId: string, nodeId: string, revision: number) {
    const node = this.nodeRecords.get(nodeId)
    if (node === undefined) return { ok: false as const, reason: 'not_found' }
    if (node.revision !== revision) return { ok: false as const, reason: 'stale_revision' }
    node.revision += 1
    node.lastHeartbeatAt = Date.now()
    return { ok: true as const, revision: node.revision }
  }

  async claimJob(_installationId: string, nodeId: string, leaseDurationMs: number) {
    if (this.claimFailures-- > 0) throw new Error('network unavailable')
    const now = Date.now()
    const candidate = [...this.jobs.values()].find(
      (job) =>
        job.status === 'queued' ||
        ((job.status === 'leased' || job.status === 'running') &&
          (job.leaseExpiresAt ?? 0) <= now),
    )
    if (candidate === undefined) return null
    if (candidate.status === 'running') {
      const oldRun = this.runs.get(`run:${candidate.jobId}:${candidate.attempt}`)
      if (oldRun !== undefined) oldRun.status = 'failed'
    }
    const reclaimed = candidate.status !== 'queued'
    Object.assign(candidate, {
      status: 'leased',
      attempt: candidate.attempt + 1,
      leaseOwnerNodeId: nodeId,
      leaseExpiresAt: now + leaseDurationMs,
      revision: candidate.revision + 1,
    })
    return { job: { ...candidate }, reclaimed }
  }

  async renewLease(_installationId: string, nodeId: string, input: Job, leaseDurationMs: number) {
    if (this.renewFailure !== null) return { ok: false as const, reason: this.renewFailure }
    const job = this.jobs.get(input.jobId)
    if (job === undefined) return { ok: false as const, reason: 'not_found' }
    if (job.leaseOwnerNodeId !== nodeId) return { ok: false as const, reason: 'not_lease_owner' }
    if (job.revision !== input.revision) return { ok: false as const, reason: 'stale_revision' }
    job.revision += 1
    job.leaseExpiresAt = Date.now() + leaseDurationMs
    return { ok: true as const, revision: job.revision }
  }

  async startRun(_installationId: string, nodeId: string, input: Job) {
    const job = this.jobs.get(input.jobId)
    if (job === undefined) return { ok: false as const, reason: 'not_found' }
    if (job.revision !== input.revision || job.status !== 'leased') {
      return { ok: false as const, reason: 'stale_revision' }
    }
    job.status = 'running'
    job.revision += 1
    const run: Run = {
      installationId: job.installationId,
      runId: `run:${job.jobId}:${job.attempt}`,
      jobId: job.jobId,
      attempt: job.attempt,
      nodeId,
      status: 'running',
      revision: 0,
    }
    this.runs.set(run.runId, run)
    return { ok: true as const, created: true, job: { ...job }, run: { ...run } }
  }

  async appendEvents(
    _installationId: string,
    nodeId: string,
    inputJob: Job,
    inputRun: Run,
    events: RunEventInput[],
  ) {
    const job = this.jobs.get(inputJob.jobId)
    const run = this.runs.get(inputRun.runId)
    if (job?.leaseOwnerNodeId !== nodeId) return { ok: false as const, reason: 'not_lease_owner' }
    if (job.revision !== inputJob.revision || run?.revision !== inputRun.revision) {
      return { ok: false as const, reason: 'stale_revision' }
    }
    this.events.push(...events)
    run.revision += events.length
    return { ok: true as const, duplicate: false, revision: run.revision }
  }

  async completeRun(
    _installationId: string,
    nodeId: string,
    inputJob: Job,
    inputRun: Run,
  ): Promise<Transition> {
    if (this.completeFailures-- > 0) throw new Error('network disconnected at completion')
    const job = this.jobs.get(inputJob.jobId)
    const run = this.runs.get(inputRun.runId)
    if (job?.leaseOwnerNodeId !== nodeId) return { ok: false, reason: 'not_lease_owner' }
    if (job.revision !== inputJob.revision || run?.revision !== inputRun.revision) {
      return { ok: false, reason: 'stale_revision' }
    }
    job.status = 'succeeded'
    job.revision += 1
    job.leaseOwnerNodeId = undefined
    run.status = 'succeeded'
    run.revision += 1
    const command = this.commands.get(job.commandId)
    if (command !== undefined) command.status = 'completed'
    return { ok: true, revision: job.revision }
  }

  async failRun(
    _installationId: string,
    _nodeId: string,
    inputJob: Job,
    inputRun: Run,
    _error: string,
    retryable: boolean,
  ): Promise<Transition> {
    const job = this.jobs.get(inputJob.jobId)
    const run = this.runs.get(inputRun.runId)
    if (job === undefined || run === undefined) return { ok: false, reason: 'not_found' }
    job.status = retryable && job.attempt < job.maxAttempts ? 'queued' : 'failed'
    job.revision += 1
    job.leaseOwnerNodeId = undefined
    run.status = 'failed'
    run.revision += 1
    return { ok: true, revision: job.revision }
  }

  async command(_installationId: string, commandId: string) {
    return this.commands.get(commandId) ?? null
  }

  async createReminder(input: {
    reminderId: string
    message: string
    remindAt: number
    timezone: string
  }) {
    const created = !this.reminderRecords.has(input.reminderId)
    if (created) {
      this.reminderRecords.set(input.reminderId, {
        message: input.message,
        remindAt: input.remindAt,
        timezone: input.timezone,
      })
    }
    return { created }
  }

  async createInstallation() {
    return { created: true }
  }

  async submit(input: {
    installationId: string
    commandId: string
    idempotencyKey: string
    input: string
    maxAttempts: number
  }) {
    const job: Job = {
      installationId: input.installationId,
      jobId: `job:${input.commandId}`,
      commandId: input.commandId,
      status: 'queued',
      attempt: 0,
      maxAttempts: input.maxAttempts,
      revision: 0,
    }
    this.jobs.set(job.jobId, job)
    this.commands.set(input.commandId, { input: input.input, status: 'accepted' })
    return { created: true, job: { ...job } }
  }

  async nodes() {
    return [...this.nodeRecords.values()]
  }

  async reminders() {
    return [...this.reminderRecords.entries()].map(([reminderId, reminder]) => ({
      reminderId,
      message: reminder.message,
    }))
  }

  async runEvents() {
    return this.events
  }

  async close() {}
}
