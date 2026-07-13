import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

test('actual SIGTERM exits before the service timeout with a non-cooperative session', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kriyan-signal-'))
  try {
    const child = Bun.spawn(['bun', 'apps/node/test/signal-child.ts', dataDir], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const reader = child.stdout.getReader()
    const decoder = new TextDecoder()
    const first = await reader.read()
    let stdout = first.done ? '' : decoder.decode(first.value, { stream: true })
    expect(stdout).toContain('READY')
    const startedAt = Date.now()
    child.kill('SIGTERM')
    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(2_000).then(() => -999),
    ])
    while (true) {
      const next = await reader.read()
      if (next.done) break
      stdout += decoder.decode(next.value, { stream: true })
    }
    stdout += decoder.decode()
    const stderr = await new Response(child.stderr).text()
    expect(exitCode).toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(stdout).toContain('STOPPED')
    expect(stderr).not.toContain('secret')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})
