import type { ConnectionMode } from './types'

export interface ConnectionTracker {
  mounted: boolean
  browserOnline: boolean
  transportGeneration: number
  confirmedGeneration: number
  hasConnected: boolean
  sawDisconnect: boolean
  socketConnected: boolean
}

export type ConnectionEvent =
  | { type: 'mounted'; browserOnline: boolean; socketConnected: boolean }
  | { type: 'offline' }
  | { type: 'online' }
  | { type: 'socket'; connected: boolean }

export const INITIAL_CONNECTION_TRACKER: ConnectionTracker = {
  mounted: false,
  browserOnline: true,
  transportGeneration: 0,
  confirmedGeneration: -1,
  hasConnected: false,
  sawDisconnect: false,
  socketConnected: false,
}

export function updateConnectionTracker(state: ConnectionTracker, event: ConnectionEvent): ConnectionTracker {
  if (event.type === 'mounted') {
    return {
      ...state,
      mounted: true,
      browserOnline: event.browserOnline,
      socketConnected: event.socketConnected,
      hasConnected: event.socketConnected,
      confirmedGeneration: event.socketConnected ? state.transportGeneration : -1,
    }
  }
  if (event.type === 'offline') {
    return {
      ...state,
      browserOnline: false,
      transportGeneration: state.transportGeneration + 1,
      sawDisconnect: false,
    }
  }
  if (event.type === 'online') return { ...state, browserOnline: true }
  if (!event.connected) return { ...state, socketConnected: false, sawDisconnect: true }
  return {
    ...state,
    socketConnected: true,
    hasConnected: true,
    confirmedGeneration: state.sawDisconnect || !state.hasConnected
      ? state.transportGeneration
      : state.confirmedGeneration,
  }
}

export function deriveConnectionMode(state: ConnectionTracker): ConnectionMode {
  if (!state.mounted) return 'connecting'
  if (!state.browserOnline) return 'offline'
  if (state.socketConnected && state.confirmedGeneration === state.transportGeneration) return 'online'
  return state.hasConnected ? 'reconnecting' : 'connecting'
}
