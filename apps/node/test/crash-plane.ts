import { readFile, rename, writeFile } from 'node:fs/promises'

import type { Job, NodeRecord, Run, RunEventInput } from '@kriyan/convex-client'

import { MemoryControlPlane } from './memory-plane'

interface PersistedPlane {
  jobs: Job[]
  commands: Array<[string, {
    idempotencyKey: string
    input: string
    status: 'accepted' | 'completed' | 'failed' | 'cancelled'
  }]>
  runs: Run[]
  events: RunEventInput[]
  reminders: Array<[string, { message: string; remindAt: number; timezone: string }]>
  nodes: NodeRecord[]
  publicErrors: string[]
}

export class CrashPlane extends MemoryControlPlane {
  private constructor(private readonly path: string) {
    super(Date.now)
  }

  static async open(path: string): Promise<CrashPlane> {
    const plane = new CrashPlane(path)
    try {
      const value = JSON.parse(await readFile(path, 'utf8')) as PersistedPlane
      for (const job of value.jobs) plane.jobs.set(job.jobId, job)
      for (const entry of value.commands) plane.commands.set(...entry)
      for (const run of value.runs) plane.runs.set(run.runId, run)
      plane.events.push(...value.events)
      for (const entry of value.reminders) plane.reminderRecords.set(...entry)
      for (const node of value.nodes) plane.nodeRecords.set(node.nodeId, node)
      plane.publicErrors.push(...value.publicErrors)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return plane
  }

  private async persist(): Promise<void> {
    const temporary = `${this.path}.${process.pid}.tmp`
    const value: PersistedPlane = {
      jobs: [...this.jobs.values()],
      commands: [...this.commands.entries()],
      runs: [...this.runs.values()],
      events: this.events,
      reminders: [...this.reminderRecords.entries()],
      nodes: [...this.nodeRecords.values()],
      publicErrors: this.publicErrors,
    }
    await writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8')
    await rename(temporary, this.path)
  }

  override async registerNode(input: Parameters<MemoryControlPlane['registerNode']>[0]) {
    const result = await super.registerNode(input)
    await this.persist()
    return result
  }

  override async heartbeatNode(...input: Parameters<MemoryControlPlane['heartbeatNode']>) {
    const result = await super.heartbeatNode(...input)
    await this.persist()
    return result
  }

  override async claimJob(...input: Parameters<MemoryControlPlane['claimJob']>) {
    const result = await super.claimJob(...input)
    await this.persist()
    return result
  }

  override async renewLease(...input: Parameters<MemoryControlPlane['renewLease']>) {
    const result = await super.renewLease(...input)
    await this.persist()
    return result
  }

  override async startRun(...input: Parameters<MemoryControlPlane['startRun']>) {
    const result = await super.startRun(...input)
    await this.persist()
    return result
  }

  override async appendEvents(...input: Parameters<MemoryControlPlane['appendEvents']>) {
    const result = await super.appendEvents(...input)
    await this.persist()
    return result
  }

  override async completeRun(...input: Parameters<MemoryControlPlane['completeRun']>) {
    const result = await super.completeRun(...input)
    await this.persist()
    return result
  }

  override async failRun(...input: Parameters<MemoryControlPlane['failRun']>) {
    const result = await super.failRun(...input)
    await this.persist()
    return result
  }

  override async createReminder(...input: Parameters<MemoryControlPlane['createReminder']>) {
    const result = await super.createReminder(...input)
    await this.persist()
    return result
  }

  override async submit(...input: Parameters<MemoryControlPlane['submit']>) {
    const result = await super.submit(...input)
    await this.persist()
    return result
  }

  async snapshot(): Promise<PersistedPlane> {
    await this.persist()
    return JSON.parse(await readFile(this.path, 'utf8')) as PersistedPlane
  }
}
