import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import {
  createFauxPiConversationFactory,
  createFauxPiFactory,
  LocalPiSessionFactory,
  PiAgentRuntime,
} from '../src'

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

test('official Pi adapter returns bounded agent text and typed Kriyan tool calls', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kriyan-pi-agent-'))
  const output = {
    assistantContent: 'I added the Korean task.',
    toolCalls: [{
      tool: 'kriyan.task' as const,
      input: { action: 'create' as const, taskId: 'task:korean', title: 'Practice Korean' },
    }],
  }
  const faux = createFauxPiConversationFactory(output)
  try {
    const runtime = new PiAgentRuntime(faux.factory)
    const session = await runtime.createSession('run:agent', workspace)
    const streamed: string[] = []
    const result = await session.run({
      runId: 'run:agent', input: 'Add a Korean task', workspace,
      signal: new AbortController().signal, mode: 'agent-turn',
      systemPrompt: 'Help the owner.', messages: [], toolCapabilities: ['task.write'],
    }, async (event) => {
      if (event.type === 'message') streamed.push(event.data)
    })
    await session.dispose()
    expect(result.assistantContent).toBe(output.assistantContent)
    expect(result.toolCalls).toEqual(output.toolCalls)
    expect(streamed.join('')).toBe(output.assistantContent)
    expect(streamed.join('')).not.toContain('kriyan-result')
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

test('official Pi AgentSession reopens a real persisted JSONL session', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'kriyan-pi-persisted-'))
  const expected = {
    kind: 'reminder' as const,
    message: 'persisted output',
    remindAt: 456,
    timezone: 'UTC',
  }
  const faux = createFauxPiFactory(expected, { persistent: true })
  try {
    const runtime = new PiAgentRuntime(faux.factory)
    const first = await runtime.createSession('run:first', workspace)
    const firstResult = await first.run(
      {
        runId: 'run:first',
        input: 'first prompt',
        workspace,
        signal: new AbortController().signal,
      },
      async () => undefined,
    )
    const sessionFile = first.sessionFile
    await first.dispose()
    expect(firstResult.products).toEqual([expected])
    expect(sessionFile).toBeString()
    expect((await readFile(sessionFile!, 'utf8')).endsWith('\n')).toBe(true)

    const reopened = await runtime.createSession('run:second', workspace, sessionFile)
    expect(reopened.sessionFile).toBe(sessionFile)
    await reopened.dispose()
  } finally {
    faux.dispose()
    await rm(workspace, { recursive: true, force: true })
  }
})
