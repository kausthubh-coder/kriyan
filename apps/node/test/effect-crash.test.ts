import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import type { EffectBoundary } from '../src/worker'

for (const boundary of [
  'prepared_before_commit',
  'server_committed_before_marker',
  'committed_marker_saved',
] satisfies EffectBoundary[]) {
  test(`subprocess kill/restart reconciles ${boundary} before Pi can change output`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qualified-sandpiper-726-effect-crash-'))
    const dataDir = join(directory, 'data')
    const state = join(directory, 'plane.json')
    const calls = join(directory, 'calls.txt')
    try {
      const first = Bun.spawn([
        'bun',
        'apps/node/test/effect-crash-child.ts',
        dataDir,
        state,
        calls,
        boundary,
        'original output',
      ], { stdout: 'pipe', stderr: 'pipe' })
      expect(await first.exited).not.toBe(0)
      await Bun.sleep(150)

      const restarted = Bun.spawn([
        'bun',
        'apps/node/test/effect-crash-child.ts',
        dataDir,
        state,
        calls,
        'none',
        'changed later output',
      ], { stdout: 'pipe', stderr: 'pipe' })
      const stdout = await new Response(restarted.stdout).text()
      const stderr = await new Response(restarted.stderr).text()
      expect(await restarted.exited).toBe(0)
      expect(stderr).toBe('')
      const snapshot = JSON.parse(stdout.trim().split('\n').at(-1)!) as {
        jobs: Array<{ status: string }>
        reminders: Array<[string, { message: string; remindAt: number; timezone: string }]>
      }
      expect(snapshot.jobs[0]?.status).toBe('succeeded')
      expect(snapshot.reminders).toEqual([
        ['reminder:job:command:effect-crash', { message: 'original output', remindAt: 123, timezone: 'UTC' }],
      ])
      expect(await readFile(calls, 'utf8')).toBe('1')

      const runDirectories = await readdir(join(dataDir, 'runs'))
      const checkpoints = await Promise.all(
        runDirectories.map(async (entry) =>
          JSON.parse(await readFile(join(dataDir, 'runs', entry, 'checkpoint.json'), 'utf8')) as {
            preparedEffects: Record<string, {
              effectId: string
              idempotencyKey: string
              type: string
              payload: unknown
              payloadHash: string
              phase: string
              linkage: unknown
            }>
          },
        ),
      )
      const journal = checkpoints
        .flatMap((checkpoint) => Object.values(checkpoint.preparedEffects))
        .find((effect) => effect.phase === 'committed')!
      expect(journal).toMatchObject({
        effectId: 'reminder:job:command:effect-crash',
        idempotencyKey: 'effect:job:command:effect-crash:reminder',
        type: 'reminder',
        phase: 'committed',
        payload: {
          kind: 'reminder',
          message: 'original output',
          remindAt: 123,
          timezone: 'UTC',
        },
      })
      expect(journal.payloadHash).toMatch(/^[a-f0-9]{64}$/)
      expect(journal.linkage).toBeObject()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
