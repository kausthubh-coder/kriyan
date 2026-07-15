import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'
import { decodeRouteId } from '@/components/knowledge/route-id'

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ artifactId: string }>
}) {
  const { artifactId } = await params
  return (
    <KnowledgeRoute view={{ kind: 'artifact', id: decodeRouteId(artifactId) }} />
  )
}
