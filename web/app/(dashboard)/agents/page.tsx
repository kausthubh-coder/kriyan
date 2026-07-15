import type { ReactNode } from 'react'

import { AgentWorkspaceRoute } from '@/components/agents/agent-workspace-route'
import { ProductRouteFrame } from '@/components/layout/product-navigation'

export default function AgentsPage(): ReactNode {
  return (
    <ProductRouteFrame>
      <AgentWorkspaceRoute />
    </ProductRouteFrame>
  )
}
