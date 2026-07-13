import type { ConnectionMode } from './types'

export interface RevisionedEntity { revision: number }
export interface EntityPatch<T> { value: Partial<T>; baseRevision: number }

export function mergeOptimistic<T extends RevisionedEntity>(entities: T[], patches: Record<string, EntityPatch<T>>, identify: (entity: T) => string): T[] {
  return entities.map((entity) => ({ ...entity, ...patches[identify(entity)]?.value }))
}

export function reconcilePatches<T extends RevisionedEntity>(entities: T[], patches: Record<string, EntityPatch<T>>, identify: (entity: T) => string): Record<string, EntityPatch<T>> {
  const next = { ...patches }
  for (const entity of entities) {
    const id = identify(entity)
    if (next[id] && entity.revision > next[id].baseRevision) delete next[id]
  }
  return next
}

export function deriveConnectionMode(browserOnline: boolean, websocketConnected: boolean, hasConnected: boolean): ConnectionMode {
  if (!browserOnline) return 'offline'
  if (websocketConnected) return 'online'
  return hasConnected ? 'reconnecting' : 'connecting'
}
