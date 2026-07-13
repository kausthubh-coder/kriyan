import type { ConnectionObservation } from '@kriyan/client-core'
import type { ConnectionState } from 'convex/browser'

export function observeConvexConnection(
  state: Pick<ConnectionState, 'connectionCount' | 'hasEverConnected' | 'isWebSocketConnected'>,
): ConnectionObservation {
  return {
    connectionCount: state.connectionCount,
    hasEverConnected: state.hasEverConnected,
    isWebSocketConnected: state.isWebSocketConnected,
  }
}
