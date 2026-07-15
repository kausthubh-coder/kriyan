'use client'

import { useSearchParams } from 'next/navigation'
import type { JSX } from 'react'

import { KnowledgeRoute } from './knowledge-route'
import type { KnowledgeDetailKind } from './route-id'

export function KnowledgeDetailPage({
  kind,
}: {
  kind: KnowledgeDetailKind
}): JSX.Element {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? ''

  return <KnowledgeRoute view={{ kind, id }} />
}
