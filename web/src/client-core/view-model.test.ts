import { describe, expect, test } from 'bun:test'

import { resolveKriyanConfiguration } from '@/lib/convex'

import { nextClockDelay } from './clock'
import {
  deriveConnectionMode,
  INITIAL_CONNECTION_TRACKER,
  updateConnectionTracker,
} from './connection'
import { mergeOptimistic, reconcileEntities, reconcilePatches } from './optimistic'
import { SUBSCRIPTIONS } from './repository'
import type { ReminderItem, TaskItem, TodaySnapshot } from './types'
import { conflictMessage, deriveActivity, isNodeAvailable, retryEligibility } from './view-model'

const base: TodaySnapshot = { tasks: [], reminders: [], commands: [], jobs: [], runs: [], nodes: [] }

describe('client-core view models', () => {
  test('derives queued honestly when no node has claimed the job', () => {
    const activity = deriveActivity({
      ...base,
      commands: [{ commandId: 'command:1', input: 'remind me', status: 'accepted', revision: 0, createdAt: 1, updatedAt: 1 }],
      jobs: [{ jobId: 'job:1', commandId: 'command:1', status: 'queued', attempt: 0, maxAttempts: 3, revision: 0, createdAt: 1, updatedAt: 1 }],
    })
    expect(activity[0]?.state).toBe('queued')
  })

  test('labels fake execution and completed state from the run', () => {
    const activity = deriveActivity({
      ...base,
      commands: [{ commandId: 'command:1', input: 'remind me', status: 'completed', revision: 1, createdAt: 1, updatedAt: 2 }],
      jobs: [{ jobId: 'job:1', commandId: 'command:1', status: 'succeeded', attempt: 1, maxAttempts: 3, revision: 2, createdAt: 1, updatedAt: 2 }],
      runs: [{ runId: 'run:1', jobId: 'job:1', nodeId: 'fake-node:1', status: 'succeeded', revision: 1, startedAt: 1, finishedAt: 2 }],
    })
    expect(activity[0]).toMatchObject({ state: 'completed', isFake: true })
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

  test('deduplicates a task when the subscription arrives before the mutation response', () => {
    const optimistic: TaskItem = { taskId: 'task:1', title: 'One', status: 'open', revision: 0, createdAt: 1, updatedAt: 1, optimistic: true }
    const remote: TaskItem = { ...optimistic, revision: 1, optimistic: false }
    const beforeResponse = reconcileEntities([remote], [optimistic], (task) => task.taskId)
    expect(beforeResponse).toEqual([remote])
    expect(new Set(beforeResponse.map((task) => task.taskId)).size).toBe(beforeResponse.length)
  })

  test('deduplicates a task when the mutation response arrives before the subscription', () => {
    const optimistic: TaskItem = { taskId: 'task:1', title: 'One', status: 'open', revision: 0, createdAt: 1, updatedAt: 1, optimistic: true }
    const beforeSubscription = reconcileEntities([], [optimistic], (task) => task.taskId)
    const afterSubscription = reconcileEntities([{ ...optimistic, optimistic: false }], beforeSubscription, (task) => task.taskId)
    expect(beforeSubscription).toHaveLength(1)
    expect(afterSubscription).toHaveLength(1)
  })

  test('deduplicates reminders in both subscription and mutation orderings', () => {
    const optimistic: ReminderItem = { reminderId: 'reminder:1', message: 'One', remindAt: 2, timezone: 'UTC', status: 'scheduled', revision: 0, createdAt: 1, updatedAt: 1, optimistic: true }
    const remote = { ...optimistic, optimistic: false }
    expect(reconcileEntities([remote], [optimistic], (item) => item.reminderId)).toHaveLength(1)
    const pendingFirst = reconcileEntities([], [optimistic], (item) => item.reminderId)
    expect(reconcileEntities([remote], pendingFirst, (item) => item.reminderId)).toHaveLength(1)
  })

  test('holds reconnecting across a transport generation until Convex reconnects', () => {
    let state = updateConnectionTracker(INITIAL_CONNECTION_TRACKER, { type: 'mounted', browserOnline: true, socketConnected: true })
    expect(deriveConnectionMode(state)).toBe('online')
    state = updateConnectionTracker(state, { type: 'offline' })
    expect(deriveConnectionMode(state)).toBe('offline')
    state = updateConnectionTracker(state, { type: 'online' })
    expect(deriveConnectionMode(state)).toBe('reconnecting')
    state = updateConnectionTracker(state, { type: 'socket', connected: false })
    expect(deriveConnectionMode(state)).toBe('reconnecting')
    state = updateConnectionTracker(state, { type: 'socket', connected: true })
    expect(deriveConnectionMode(state)).toBe('online')
  })

  test('uses backend attempt state for retry eligibility', () => {
    const [activity] = deriveActivity({
      ...base,
      commands: [{ commandId: 'command:1', input: 'retry', status: 'failed', revision: 3, createdAt: 1, updatedAt: 2 }],
      jobs: [{ jobId: 'job:1', commandId: 'command:1', status: 'failed', attempt: 3, maxAttempts: 3, revision: 4, createdAt: 1, updatedAt: 2 }],
    })
    expect(retryEligibility(activity!)).toEqual({ eligible: false, reason: 'All 3 attempts have been used.' })
  })

  test('declares portable pagination and ordering descriptors', () => {
    expect(SUBSCRIPTIONS.openTasks).toMatchObject({ order: 'due-ascending', paginated: true })
    expect(SUBSCRIPTIONS.scheduledReminders).toMatchObject({ order: 'time-ascending', paginated: true })
    expect(SUBSCRIPTIONS.runEvents).toMatchObject({ order: 'sequence-ascending', paginated: true })
    expect(SUBSCRIPTIONS.commands).toMatchObject({ order: 'newest-loaded-first', paginated: true })
  })

  test('fails closed without explicit deployment and installation configuration', () => {
    expect(resolveKriyanConfiguration({})).toBeNull()
    expect(resolveKriyanConfiguration({ NEXT_PUBLIC_CONVEX_URL: 'https://example.convex.cloud' })).toBeNull()
    expect(resolveKriyanConfiguration({
      NEXT_PUBLIC_CONVEX_URL: 'https://example.convex.cloud',
      NEXT_PUBLIC_KRIYAN_INSTALLATION_ID: 'installation:local-owner',
    })).toEqual({ convexUrl: 'https://example.convex.cloud', installationId: 'installation:local-owner' })
  })
})
