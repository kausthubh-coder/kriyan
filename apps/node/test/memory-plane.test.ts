import { expect, test } from 'bun:test'

import { MemoryControlPlane } from './memory-plane'

async function registeredPlane(now: () => number): Promise<MemoryControlPlane> {
  const plane = new MemoryControlPlane(now)
  await plane.submit({
    installationId: 'installation:test', commandId: 'command:test',
    idempotencyKey: 'idem:test', input: 'test', maxAttempts: 3,
  })
  const registration = await plane.registerNode({
    installationId: 'installation:test', nodeId: 'node:test', displayName: 'node',
    capabilities: ['reminders'], protocolVersion: '1',
  })
  expect(registration.node.revision).toBe(0)
  return plane
}

test('registration remains unusable until first heartbeat and becomes stale server-side', async () => {
  let now = 1_000
  const plane = await registeredPlane(() => now)
  const claim = await plane.claimJob('installation:test', 'node:test', 30_000)
  expect(claim).not.toBeNull()
  expect((await plane.startRun('installation:test', 'node:test', claim!.job))).toMatchObject({
    ok: false, reason: 'stale_heartbeat',
  })
  await plane.heartbeatNode('installation:test', 'node:test', 0)
  now += 60_001
  expect((await plane.startRun('installation:test', 'node:test', claim!.job))).toMatchObject({
    ok: false, reason: 'stale_heartbeat',
  })
})

test('lease expiry and stale revisions are rejected deterministically', async () => {
  let now = 1_000
  const plane = await registeredPlane(() => now)
  await plane.heartbeatNode('installation:test', 'node:test', 0)
  const claim = await plane.claimJob('installation:test', 'node:test', 100)
  expect(claim).not.toBeNull()
  expect(await plane.renewLease('installation:test', 'node:test', { ...claim!.job, revision: 99 }, 100)).toMatchObject({
    ok: false, reason: 'stale_revision',
  })
  now += 101
  expect(await plane.renewLease('installation:test', 'node:test', claim!.job, 100)).toMatchObject({
    ok: false, reason: 'lease_expired',
  })
})

test('event commit response loss accepts an exact retry but rejects revision drift', async () => {
  const plane = await registeredPlane(() => 1_000)
  await plane.heartbeatNode('installation:test', 'node:test', 0)
  const claim = await plane.claimJob('installation:test', 'node:test', 1_000)
  const started = await plane.startRun('installation:test', 'node:test', claim!.job)
  if (!started.ok) throw new Error(started.reason)
  const event = { eventId: 'event:1', sequence: 1, type: 'status' as const, data: 'started' }
  plane.eventResponseLosses = 1
  await expect(plane.appendEvents(
    'installation:test', 'node:test', started.job, started.run, [event],
  )).rejects.toThrow('response lost')
  expect(await plane.appendEvents(
    'installation:test', 'node:test', started.job, started.run, [event],
  )).toMatchObject({ ok: true, duplicate: true, revision: 1 })
  expect(await plane.appendEvents(
    'installation:test', 'node:test', started.job, { ...started.run, revision: 99 },
    [{ ...event, eventId: 'event:2', sequence: 2 }],
  )).toMatchObject({ ok: false, reason: 'stale_revision' })
})
