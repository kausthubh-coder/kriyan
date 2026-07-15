import type { ReactNode } from 'react'

import { AgentWorkspaceDemo } from '@/components/agents/agent-workspace'
import { ProductRouteFrame } from '@/components/layout/product-navigation'

export default function AgentsPage(): ReactNode {
  return (
    <ProductRouteFrame>
      <AgentWorkspaceDemo />
    </ProductRouteFrame>
  )
}
