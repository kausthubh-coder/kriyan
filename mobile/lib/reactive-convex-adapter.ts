import {
  createReactiveRepositoryFromTransport,
  type ReactiveClientRepository,
  type SnapshotSubscriptionTransport,
} from '@kriyan/client-core'

export function createExpoReactiveRepository(transport: SnapshotSubscriptionTransport): ReactiveClientRepository {
  return createReactiveRepositoryFromTransport(transport)
}
