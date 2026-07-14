import { KnowledgeRoute } from '@/components/knowledge/knowledge-route'

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ artifactId: string }>
}) {
  const { artifactId } = await params
  return <KnowledgeRoute view={{ kind: 'artifact', id: artifactId }} />
}
