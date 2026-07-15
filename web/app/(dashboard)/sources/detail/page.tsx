import { Suspense, type JSX } from 'react'

import { KnowledgeDetailPage } from '@/components/knowledge/knowledge-detail-page'

export default function SourceDetailPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <KnowledgeDetailPage kind="source" />
    </Suspense>
  )
}
