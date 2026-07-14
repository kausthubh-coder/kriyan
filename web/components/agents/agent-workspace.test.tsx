import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentWorkspace } from './agent-workspace'
import { DeterministicAgentWorkspacePort } from './demo-agent-workspace-port'

describe('AgentWorkspace', () => {
  test('renders durable conversation and runtime detail without fake streaming copy', () => {
    const markup = renderToStaticMarkup(<AgentWorkspace port={new DeterministicAgentWorkspacePort()} />)
    expect(markup).toContain('Korean learning loop')
    expect(markup).toContain('Pinned to')
    expect(markup).toContain('Durable effect checkpoint')
    expect(markup).toContain('Deterministic preview')
    expect(markup).not.toContain('Generating response')
  })

  test('renders instructional empty and recoverable load-error states', () => {
    const empty = new DeterministicAgentWorkspacePort()
    empty.setPreviewScenario('empty')
    expect(renderToStaticMarkup(<AgentWorkspace port={empty} />)).toContain('No agent definitions yet')

    const failed = new DeterministicAgentWorkspacePort()
    failed.setPreviewScenario('load_error')
    const failedMarkup = renderToStaticMarkup(<AgentWorkspace port={failed} />)
    expect(failedMarkup).toContain('Agent workspace did not load')
    expect(failedMarkup).toContain('Retry')
  })
})
