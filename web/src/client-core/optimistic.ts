import type { TransitionReason } from './types'

export interface RevisionedEntity { revision: number }
export interface EntityPatch<T> { value: Partial<T>; baseRevision: number }

export function reconcileEntities<T>(
  remote: readonly T[],
  optimistic: readonly T[],
  identify: (entity: T) => string,
): T[] {
  const unique = new Map<string, T>()
  for (const entity of optimistic) unique.set(identify(entity), entity)
  for (const entity of remote) unique.set(identify(entity), entity)
  return [...unique.values()]
}

export function mergeOptimistic<T extends RevisionedEntity>(
  entities: readonly T[],
  patches: Readonly<Record<string, EntityPatch<T>>>,
  identify: (entity: T) => string,
): T[] {
  return entities.map((entity) => ({ ...entity, ...patches[identify(entity)]?.value }))
}

export function reconcilePatches<T extends RevisionedEntity>(
  entities: readonly T[],
  patches: Readonly<Record<string, EntityPatch<T>>>,
  identify: (entity: T) => string,
): Record<string, EntityPatch<T>> {
  const next = { ...patches }
  for (const entity of entities) {
    const id = identify(entity)
    if (next[id] && entity.revision > next[id].baseRevision) delete next[id]
  }
  return next
}

export function normalizeTransitionReason(reason: unknown): TransitionReason {
  if (
    reason === 'not_found' ||
    reason === 'stale_revision' ||
    reason === 'invalid_state' ||
    reason === 'attempts_exhausted' ||
    reason === 'already_terminal'
  ) return reason
  return 'transport_error'
}
