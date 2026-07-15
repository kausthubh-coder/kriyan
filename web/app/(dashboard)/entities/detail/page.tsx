import { Suspense, type JSX } from 'react'

import { KnowledgeDetailPage } from '@/components/knowledge/knowledge-detail-page'

export default function EntityDetailPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <KnowledgeDetailPage kind="entity" />
    </Suspense>
  )
}
