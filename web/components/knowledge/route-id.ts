export type KnowledgeDetailKind = 'artifact' | 'entity' | 'source'

export function knowledgeDetailHref(
  kind: KnowledgeDetailKind,
  id: string,
): string {
  return `/${kind === 'entity' ? 'entities' : `${kind}s`}/detail/?id=${encodeURIComponent(id)}`
}
