import {
  createReactiveRepositoryFromTransport,
  type ReactiveClientRepository,
  type SnapshotSubscriptionTransport,
} from '@kriyan/client-core'

export function createWebReactiveRepository(transport: SnapshotSubscriptionTransport): ReactiveClientRepository {
  return createReactiveRepositoryFromTransport(transport)
}
