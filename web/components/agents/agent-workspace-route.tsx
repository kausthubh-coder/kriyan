'use client'

import type { ReactNode } from 'react'

import { useRuntimeSettings } from '@/lib/runtime-settings'

import { AgentWorkspaceDemo } from './agent-workspace'
import { LiveAgentWorkspace } from './live-agent-workspace-port'

export function AgentWorkspaceRoute(): ReactNode {
  const { settings } = useRuntimeSettings()
  return settings.demoMode
    ? <AgentWorkspaceDemo />
    : <LiveAgentWorkspace configuration={settings} />
}
