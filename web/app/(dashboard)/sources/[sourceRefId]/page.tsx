import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ sourceRefId: string }>
}) {
  const { sourceRefId } = await params
  return <KnowledgeRoute view={{ kind: 'source', id: sourceRefId }} />
}
