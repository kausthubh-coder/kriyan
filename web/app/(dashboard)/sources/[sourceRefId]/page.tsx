import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'
import { decodeRouteId } from '@/components/knowledge/route-id'

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ sourceRefId: string }>
}) {
  const { sourceRefId } = await params
  return (
    <KnowledgeRoute view={{ kind: 'source', id: decodeRouteId(sourceRefId) }} />
  )
}
