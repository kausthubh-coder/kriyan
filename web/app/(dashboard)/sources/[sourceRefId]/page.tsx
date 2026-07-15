import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'
import { decodeRouteId } from '@/components/knowledge/route-id'

export function generateStaticParams(): Array<{ sourceRefId: string }> {
  return [
    { sourceRefId: 'src:kriyan-plan' },
    { sourceRefId: 'src:meeting-audio' },
  ]
}

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
