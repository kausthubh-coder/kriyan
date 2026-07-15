import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'
import { decodeRouteId } from '@/components/knowledge/route-id'

export function generateStaticParams(): Array<{ entityId: string }> {
  return [{ entityId: 'entity:kriyan' }]
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>
}) {
  const { entityId } = await params
  return (
    <KnowledgeRoute view={{ kind: 'entity', id: decodeRouteId(entityId) }} />
  )
}
