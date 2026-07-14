import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>
}) {
  const { entityId } = await params
  return <KnowledgeRoute view={{ kind: 'entity', id: entityId }} />
}
