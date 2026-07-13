import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

async function readUntil(
  reader: { read(): Promise<{ done: boolean; value?: Uint8Array }> },
  marker: string,
): Promise<string> {
  const decoder = new TextDecoder()
  let output = ''
  while (!output.includes(marker)) {
    const next = await reader.read()
    if (next.done) break
    output += decoder.decode(next.value, { stream: true })
  }
  return output
}

for (const mode of ['cooperative-signal', 'noncooperative'] as const) {
test(`real signal runner naturally exits and retryably restarts a ${mode} session`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qualified-sandpiper-726-signal-'))
  const dataDir = join(directory, 'data')
  const statePath = join(directory, 'state.json')
  try {
    const child = Bun.spawn([
      'bun', 'apps/node/test/signal-child.ts', dataDir, statePath, mode,
    ], { stdout: 'pipe', stderr: 'pipe' })
    const reader = child.stdout.getReader()
    let stdout = await readUntil(reader, 'RUNTIME_ACTIVE')
    expect(stdout).toContain('RUNTIME_ACTIVE')
    const startedAt = Date.now()
    child.kill('SIGTERM')
    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(2_000).then(() => -999),
    ])
    while (true) {
      const next = await reader.read()
      if (next.done) break
      stdout += new TextDecoder().decode(next.value)
    }
    const stderr = await new Response(child.stderr).text()
    expect(exitCode).toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(stdout).toContain('STOPPED')
    if (mode === 'noncooperative') expect(stderr).toContain('RUNTIME_DISPOSE_TIMEOUT')
    else expect(stderr).not.toContain('RUNTIME_DISPOSE_TIMEOUT')

    const stoppedState = JSON.parse(await readFile(statePath, 'utf8')) as {
      jobs: Array<{ status: string; leaseOwnerNodeId?: string }>
      runs: Array<{ status: string }>
      publicErrors: string[]
    }
    expect(stoppedState.jobs[0]).toMatchObject({ status: 'queued' })
    expect(stoppedState.jobs[0]?.leaseOwnerNodeId).toBeUndefined()
    expect(stoppedState.runs[0]?.status).toBe('failed')
    expect(stoppedState.publicErrors).toContain('NODE_SHUTDOWN')
    const checkpointDirectory = (await readdir(join(dataDir, 'runs')))[0]!
    const checkpoint = JSON.parse(
      await readFile(join(dataDir, 'runs', checkpointDirectory, 'checkpoint.json'), 'utf8'),
    ) as { shutdown: { phase: string; reason: string; requestedAt: number } }
    expect(checkpoint.shutdown).toEqual({
      phase: 'released',
      reason: 'service_shutdown',
      requestedAt: expect.any(Number),
    })

    const restarted = Bun.spawn([
      'bun', 'apps/node/test/signal-child.ts', dataDir, statePath, 'cooperative',
    ], { stdout: 'pipe', stderr: 'pipe' })
    const restartedStdout = await new Response(restarted.stdout).text()
    expect(await restarted.exited).toBe(0)
    expect(restartedStdout).toContain('RESTARTED')
    const restartedState = JSON.parse(await readFile(statePath, 'utf8')) as {
      jobs: Array<{ status: string }>
      reminders: unknown[]
    }
    expect(restartedState.jobs[0]?.status).toBe('succeeded')
    expect(restartedState.reminders).toHaveLength(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
}
