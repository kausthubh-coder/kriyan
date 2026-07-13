import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { createFauxPiFactory, LocalPiSessionFactory, PiAgentRuntime } from '../src'

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

test('Pi runtime passes an explicit persisted session path when resuming', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kriyan-pi-resume-'))
  const faux = createFauxPiFactory({
    kind: 'reminder', message: 'resume', remindAt: 123, timezone: 'UTC',
  })
  const calls: Array<string | undefined> = []
  try {
    const runtime = new PiAgentRuntime({
      async create(path, resumeSessionFile) {
        calls.push(resumeSessionFile)
        return await faux.factory.create(path, resumeSessionFile)
      },
    })
    const session = await runtime.createSession('run:resume', workspace, '/tmp/pi-session.jsonl')
    await session.dispose()
    expect(calls).toEqual(['/tmp/pi-session.jsonl'])
  } finally {
    faux.dispose()
    await rm(workspace, { recursive: true, force: true })
  }
})

test('truncated Pi session fails closed instead of silently starting over', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kriyan-pi-corrupt-'))
  const sessionFile = join(workspace, 'session.jsonl')
  try {
    await writeFile(sessionFile, '{"type":"session"', 'utf8')
    await expect(new LocalPiSessionFactory().create(workspace, sessionFile)).rejects.toMatchObject({
      code: 'PI_SESSION_CORRUPT',
    })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
