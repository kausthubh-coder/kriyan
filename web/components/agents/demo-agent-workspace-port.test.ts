import { describe, expect, test } from 'bun:test'

import { DeterministicAgentWorkspacePort } from './demo-agent-workspace-port'

describe('DeterministicAgentWorkspacePort', () => {
  test('pins an existing thread while a new revision becomes current', async () => {
    const port = new DeterministicAgentWorkspacePort()
    const before = port.getSnapshot()
    const existing = before.threads.find((thread) => thread.threadId === 'thread:korean')
    const agent = before.agents.find((item) => item.agentId === 'agent:kriyan')
    expect(existing?.agentRevisionId).toBe('agent-revision:kriyan:2')
    expect(agent?.currentRevisionId).toBe('agent-revision:kriyan:3')

    const revised = await port.reviseAgent({
      agentId: 'agent:kriyan',
      displayName: 'Kriyan',
      systemPromptSummary: 'Use the new revision only for future threads.',
      toolCapabilities: ['task.write', 'note.read'],
    })
    expect(revised.ok).toBe(true)

    const created = await port.createThread({
      agentId: 'agent:kriyan',
      title: 'Future work',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.agentRevisionId).toBe('agent-revision:kriyan:4')
    expect(port.getSnapshot().threads.find((thread) => thread.threadId === existing?.threadId)?.agentRevisionId).toBe('agent-revision:kriyan:2')
  })

  test('deduplicates one client request without creating a second turn', async () => {
    const port = new DeterministicAgentWorkspacePort()
    const created = await port.createThread({ agentId: 'agent:kriyan', title: 'Idempotent thread' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const input = {
      threadId: created.value.threadId,
      content: 'Create one durable turn.',
      clientRequestId: 'request:one',
    }
    const first = await port.submitMessage(input)
    const second = await port.submitMessage(input)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.value.runId).toBe(first.value.runId)
    expect(port.getSnapshot().messages.filter((message) => message.threadId === created.value.threadId)).toHaveLength(1)
    expect(port.getSnapshot().runs.filter((run) => run.threadId === created.value.threadId)).toHaveLength(1)

    const conflict = await port.submitMessage({ ...input, content: 'Different content.' })
    expect(conflict).toMatchObject({ ok: false, code: 'conflict' })
  })

  test('preserves durable data and rejects writes while Convex is offline', async () => {
    const port = new DeterministicAgentWorkspacePort()
    const before = port.getSnapshot().threads.length
    port.setPreviewScenario('offline')
    const result = await port.createThread({ agentId: 'agent:kriyan', title: 'Do not create' })
    expect(result).toMatchObject({ ok: false, code: 'offline' })
    expect(port.getSnapshot().threads).toHaveLength(before)
    expect(port.getSnapshot().connection).toBe('offline')
  })

  test('does not silently migrate an active session-bound turn', async () => {
    const port = new DeterministicAgentWorkspacePort()
    const activeReset = await port.resetSession('thread:korean')
    expect(activeReset).toMatchObject({ ok: false, code: 'conflict' })

    const cancelled = await port.cancelRun('run:korean:7')
    expect(cancelled.ok).toBe(true)
    const reset = await port.resetSession('thread:korean')
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.value.preferredNodeId).toBeUndefined()
    expect(reset.value.sessionState).toBe('portable')
    expect(reset.value.sessionRevision).toBe(5)
  })

  test('keeps retry honest and waiting for the same unavailable session node', async () => {
    const port = new DeterministicAgentWorkspacePort()
    const retried = await port.retryRun('run:travel:2')
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(retried.value.state).toBe('waiting_for_node')
    expect(retried.value.nodeId).toBe('node:archive')
    expect(retried.value.attempt).toBe(3)
    expect(port.getSnapshot().threads.find((thread) => thread.threadId === 'thread:travel')).toMatchObject({
      activeRunId: 'run:travel:2',
      sessionState: 'waiting_for_node',
      preferredNodeId: 'node:archive',
    })
  })

  test('lets the failed-run preview recover through the same retry control', async () => {
    const port = new DeterministicAgentWorkspacePort()
    port.setPreviewScenario('failed')
    expect(port.getSnapshot().runs.find((run) => run.runId === 'run:korean:7')?.state).toBe('failed')
    const retried = await port.retryRun('run:korean:7')
    expect(retried.ok).toBe(true)
    expect(port.getSnapshot().previewScenario).toBe('ready')
    expect(port.getSnapshot().runs.find((run) => run.runId === 'run:korean:7')?.state).toBe('waiting_for_node')
  })
})
