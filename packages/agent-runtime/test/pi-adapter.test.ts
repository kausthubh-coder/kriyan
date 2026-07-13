import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { createFauxPiFactory, PiAgentRuntime } from '../src'

test('official Pi AgentSession faux provider runs through the thin adapter', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kriyan-pi-'))
  const expected = {
    kind: 'reminder' as const,
    message: 'practice Korean',
    remindAt: 123_456,
    timezone: 'UTC',
  }
  const faux = createFauxPiFactory(expected)
  try {
    const runtime = new PiAgentRuntime(faux.factory)
    const session = await runtime.createSession('run:pi', workspace)
    const events: string[] = []
    const result = await session.run(
      {
        runId: 'run:pi',
        input: 'remind me to practice Korean',
        workspace,
        signal: new AbortController().signal,
      },
      async (event) => void events.push(event.type),
    )
    await session.dispose()
    expect(result.products).toEqual([expected])
    expect(events).toContain('message')
    expect(faux.provider.state.callCount).toBe(1)
  } finally {
    faux.dispose()
    await rm(workspace, { recursive: true, force: true })
  }
})
