import { describe, expect, test } from 'bun:test'

import {
  deriveConnectionMode,
  INITIAL_CONNECTION_TRACKER,
  needsConnectionRecreate,
  retainLastConfirmed,
  updateConnectionTracker,
  type ConnectionTracker,
} from './connection'
import { mergeOptimistic, reconcileEntities, reconcilePatches } from './optimistic'
import { beginPending, endPending } from './pending'
import type { ActivityProjectionItem, ReminderItem, TaskItem } from './types'
import {
  conflictMessage,
  deriveActivity,
  isNodeAvailable,
  nextClockDelay,
  retryEligibility,
} from './view-model'

function projection(
  commandStatus: 'accepted' | 'completed' | 'failed' | 'cancelled',
  jobStatus: 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled',
  attempt: number,
  runStatus?: 'running' | 'succeeded' | 'failed' | 'cancelled',
): ActivityProjectionItem {
  return {
    command: { commandId: 'command:1', input: 'retry', status: commandStatus, revision: 3, createdAt: 1, updatedAt: 2 },
    job: { jobId: 'job:1', commandId: 'command:1', status: jobStatus, attempt, maxAttempts: 3, revision: 4, createdAt: 1, updatedAt: 2 },
    run: runStatus ? { runId: `run:${attempt}`, jobId: 'job:1', attempt, nodeId: 'node:1', status: runStatus, revision: 1, startedAt: attempt } : undefined,
  }
}

describe('activity authority', () => {
  test('accepted and queued retry outrank the previous failed run', () => {
    const item = projection('accepted', 'queued', 1, 'failed')
    expect(deriveActivity([item])[0]?.state).toBe('queued')
  })

  test('leased and running jobs are active', () => {
    expect(deriveActivity([projection('accepted', 'leased', 2)])[0]?.state).toBe('running')
    expect(deriveActivity([projection('accepted', 'running', 2, 'running')])[0]?.state).toBe('running')
  })

  test('new attempt run and completed aggregate stay coherent', () => {
    const running = deriveActivity([projection('accepted', 'running', 2, 'running')])[0]
    expect(running?.run?.attempt).toBe(running?.job?.attempt)
    expect(deriveActivity([projection('completed', 'succeeded', 2, 'succeeded')])[0]?.state).toBe('completed')
  })

  test('exhausted aggregate remains failed and cannot retry', () => {
    const failed = deriveActivity([projection('failed', 'failed', 3, 'failed')])[0]!
    expect(failed.state).toBe('failed')
    expect(retryEligibility(failed)).toEqual({ eligible: false, reason: 'All 3 attempts have been used.' })
  })
})

describe('connection generation state machine', () => {
  test('requires a subscription confirmation even on the first ready generation', () => {
    let state = updateConnectionTracker(INITIAL_CONNECTION_TRACKER, {
      type: 'mounted',
      browserOnline: true,
      clientGeneration: 0,
      observation: { isWebSocketConnected: false, hasEverConnected: false, connectionCount: 0 },
      now: 0,
    })
    expect(deriveConnectionMode(state)).toBe('connecting')
    state = updateConnectionTracker(state, {
      type: 'observed',
      clientGeneration: 0,
      observation: { isWebSocketConnected: true, hasEverConnected: true, connectionCount: 0 },
      now: 1,
    })
    expect(state.recovery).toBe('awaiting-subscription')
    state = updateConnectionTracker(state, { type: 'subscription-confirmed', clientGeneration: 0, connectionCount: 0 })
    expect(deriveConnectionMode(state)).toBe('online')
  })

  test('bounds awaiting-ready when Convex emits no greater generation', () => {
    let state: ConnectionTracker = { ...INITIAL_CONNECTION_TRACKER, mounted: true, browserOnline: true, socketConnected: true, hasEverConnected: true, readyCount: 4, confirmedCount: 4, recovery: 'confirmed' }
    state = updateConnectionTracker(state, { type: 'observed', clientGeneration: 0, observation: { isWebSocketConnected: false, hasEverConnected: true, connectionCount: 4 }, now: 10 })
    expect(state.disconnectCount).toBe(4)
    expect(state.confirmationDeadlineAt).toBe(15_010)
    state = updateConnectionTracker(state, { type: 'observed', clientGeneration: 0, observation: { isWebSocketConnected: true, hasEverConnected: true, connectionCount: 4 }, now: 20 })
    state = updateConnectionTracker(state, { type: 'ready-timeout', clientGeneration: 0, connectionCount: 4, now: 15_010 })
    expect(needsConnectionRecreate(state)).toBe(true)
    expect(deriveConnectionMode(state)).toBe('reconnecting')
  })

  test('bounds the current-generation probe and never uses a timeout to claim online', () => {
    let state: ConnectionTracker = { ...INITIAL_CONNECTION_TRACKER, mounted: true, browserOnline: true, socketConnected: true, hasEverConnected: true, readyCount: 2, disconnectCount: 1, recovery: 'awaiting-subscription', confirmationDeadlineAt: 100 }
    state = updateConnectionTracker(state, { type: 'subscription-confirmed', clientGeneration: 1, connectionCount: 2 })
    expect(state.recovery).toBe('awaiting-subscription')
    state = updateConnectionTracker(state, { type: 'confirmation-timeout', clientGeneration: 0, connectionCount: 2, now: 100 })
    expect(needsConnectionRecreate(state)).toBe(true)
    expect(deriveConnectionMode(state)).toBe('reconnecting')
  })

  test('recovers only after a greater ready count and matching probe while retaining confirmed state', () => {
    let tabA: ConnectionTracker = { ...INITIAL_CONNECTION_TRACKER, mounted: true, browserOnline: true, socketConnected: true, hasEverConnected: true, readyCount: 4, confirmedCount: 4, recovery: 'confirmed' }
    tabA = updateConnectionTracker(tabA, { type: 'observed', clientGeneration: 0, observation: { isWebSocketConnected: false, hasEverConnected: true, connectionCount: 4 }, now: 10 })
    tabA = updateConnectionTracker(tabA, { type: 'observed', clientGeneration: 0, observation: { isWebSocketConnected: true, hasEverConnected: true, connectionCount: 5 }, now: 20 })
    tabA = updateConnectionTracker(tabA, { type: 'subscription-confirmed', clientGeneration: 0, connectionCount: 5 })
    expect(deriveConnectionMode(tabA)).toBe('online')

    const tabB = updateConnectionTracker({ ...INITIAL_CONNECTION_TRACKER }, { type: 'mounted', browserOnline: true, clientGeneration: 0, observation: { isWebSocketConnected: true, hasEverConnected: true, connectionCount: 7 }, now: 0 })
    expect(tabB.readyCount).toBe(7)
    expect(retainLastConfirmed('reconnecting', ['warming'], ['confirmed'])).toEqual(['confirmed'])
    expect(retainLastConfirmed('online', ['current'], ['confirmed'])).toEqual(['current'])
  })
})

describe('preserved portable behavior', () => {
  test('locks pending actions per entity and releases them deterministically', () => {
    const first = beginPending(new Set(), 'task:1')
    expect(first.acquired).toBe(true)
    expect(beginPending(first.keys, 'task:1').acquired).toBe(false)
    expect(endPending(first.keys, 'task:1').has('task:1')).toBe(false)
  })

  test('requires both online status and a fresh heartbeat', () => {
    const node = { nodeId: 'node:1', displayName: 'Node', capabilities: [], status: 'online' as const, lastHeartbeatAt: 100_000, revision: 0 }
    expect(isNodeAvailable(node, 160_000)).toBe(true)
    expect(isNodeAvailable(node, 160_001)).toBe(false)
  })

  test('clock aligns to the heartbeat boundary before the next minute', () => {
    expect(nextClockDelay(119_000, [59_050])).toBe(51)
    expect(nextClockDelay(119_500, [])).toBe(500)
  })

  test('explains typed revision and retry failures', () => {
    expect(conflictMessage('stale_revision')).toContain('rolled back')
    expect(conflictMessage('attempts_exhausted')).toContain('all of its attempts')
  })

  test('merges an optimistic patch until a newer server revision arrives', () => {
    const tasks = [{ taskId: 'task:1', title: 'Old', status: 'open' as const, revision: 2, createdAt: 1, updatedAt: 1 }]
    const patches = { 'task:1': { value: { title: 'New' }, baseRevision: 2 } }
    expect(mergeOptimistic(tasks, patches, (task) => task.taskId)[0]?.title).toBe('New')
    expect(Object.keys(reconcilePatches([{ ...tasks[0]!, revision: 3 }], patches, (task) => task.taskId))).toHaveLength(0)
  })

  test('deduplicates optimistic tasks in both subscription orderings', () => {
    const optimistic: TaskItem = { taskId: 'task:1', title: 'One', status: 'open', revision: 0, createdAt: 1, updatedAt: 1, optimistic: true }
    const remote: TaskItem = { ...optimistic, revision: 1, optimistic: false }
    expect(reconcileEntities([remote], [optimistic], (task) => task.taskId)).toEqual([remote])
    expect(reconcileEntities([remote], reconcileEntities([], [optimistic], (task) => task.taskId), (task) => task.taskId)).toHaveLength(1)
  })

  test('deduplicates optimistic reminders in both subscription orderings', () => {
    const optimistic: ReminderItem = { reminderId: 'reminder:1', message: 'One', remindAt: 2, timezone: 'UTC', status: 'scheduled', revision: 0, createdAt: 1, updatedAt: 1, optimistic: true }
    const remote = { ...optimistic, optimistic: false }
    expect(reconcileEntities([remote], [optimistic], (item) => item.reminderId)).toHaveLength(1)
    expect(reconcileEntities([remote], reconcileEntities([], [optimistic], (item) => item.reminderId), (item) => item.reminderId)).toHaveLength(1)
  })
})
