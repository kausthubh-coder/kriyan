import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import {
  readProcessHealth,
  satisfiesProcessHealth,
  writeProcessHealth,
  type ProcessHealthRecord,
} from '../src/process-health'

test('health requires the expected new release instance, newer heartbeat, and stability', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qualified-sandpiper-726-health-'))
  const record: ProcessHealthRecord = {
    schemaVersion: 1,
    installationId: 'installation:qualified-sandpiper-726-health',
    nodeId: 'node:health',
    processInstanceId: 'process:new',
    releaseId: 'release:new',
    pid: 123,
    startedAt: 1_000,
    heartbeatAt: 2_000,
    ready: true,
  }
  try {
    await writeProcessHealth(directory, record)
    expect(await readProcessHealth(directory)).toEqual(record)
    expect(satisfiesProcessHealth(record, {
      expectedRelease: 'release:new',
      notInstance: 'process:old',
      heartbeatAfter: 1_500,
      stabilityMs: 1_000,
      observedAt: 2_000,
    })).toBe(true)
    expect(satisfiesProcessHealth(record, {
      expectedRelease: 'release:old', observedAt: 2_000,
    })).toBe(false)
    expect(satisfiesProcessHealth(record, {
      notInstance: 'process:new', observedAt: 2_000,
    })).toBe(false)
    expect(satisfiesProcessHealth(record, {
      heartbeatAfter: 2_000, observedAt: 2_000,
    })).toBe(false)
    expect(satisfiesProcessHealth(record, {
      stabilityMs: 1_001, observedAt: 2_000,
    })).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
