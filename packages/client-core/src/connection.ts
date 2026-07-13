import type { ConnectionMode, ConnectionRecovery } from './types'

export const RECONNECT_CONFIRMATION_TIMEOUT_MS = 15_000

export interface ConnectionObservation {
  isWebSocketConnected: boolean
  hasEverConnected: boolean
  connectionCount: number
}

export interface ConnectionTracker {
  mounted: boolean
  browserOnline: boolean
  socketConnected: boolean
  hasEverConnected: boolean
  readyCount: number
  disconnectCount: number | null
  confirmedCount: number
  recovery: ConnectionRecovery
  confirmationDeadlineAt: number | null
}

export type ConnectionEvent =
  | { type: 'mounted'; browserOnline: boolean; observation: ConnectionObservation; now: number }
  | { type: 'browser-offline'; now: number }
  | { type: 'browser-online' }
  | { type: 'observed'; observation: ConnectionObservation; now: number }
  | { type: 'subscription-confirmed'; connectionCount: number }
  | { type: 'confirmation-timeout'; connectionCount: number; now: number }
  | { type: 'recreate-requested' }

export const INITIAL_CONNECTION_TRACKER: ConnectionTracker = {
  mounted: false,
  browserOnline: true,
  socketConnected: false,
  hasEverConnected: false,
  readyCount: 0,
  disconnectCount: null,
  confirmedCount: -1,
  recovery: 'initial',
  confirmationDeadlineAt: null,
}

function observeReady(
  state: ConnectionTracker,
  observation: ConnectionObservation,
  now: number,
): ConnectionTracker {
  const disconnected = state.socketConnected && !observation.isWebSocketConnected
  const disconnectCount = disconnected
    ? state.readyCount
    : state.disconnectCount
  const hasNewReadyGeneration = observation.isWebSocketConnected
    && disconnectCount !== null
    && observation.connectionCount > disconnectCount
  return {
    ...state,
    socketConnected: observation.isWebSocketConnected,
    hasEverConnected: observation.hasEverConnected,
    readyCount: observation.connectionCount,
    disconnectCount,
    recovery: disconnected
      ? 'awaiting-ready'
      : hasNewReadyGeneration
        ? 'awaiting-subscription'
        : state.recovery,
    confirmationDeadlineAt: hasNewReadyGeneration
      ? now + RECONNECT_CONFIRMATION_TIMEOUT_MS
      : disconnected
        ? null
        : state.confirmationDeadlineAt,
  }
}

export function updateConnectionTracker(
  state: ConnectionTracker,
  event: ConnectionEvent,
): ConnectionTracker {
  if (event.type === 'mounted') {
    const mounted = observeReady(
      { ...state, mounted: true, browserOnline: event.browserOnline },
      event.observation,
      event.now,
    )
    return event.observation.isWebSocketConnected
      ? {
          ...mounted,
          recovery: 'awaiting-subscription',
          confirmationDeadlineAt: event.now + RECONNECT_CONFIRMATION_TIMEOUT_MS,
        }
      : mounted
  }
  if (event.type === 'browser-offline') {
    return {
      ...state,
      browserOnline: false,
      disconnectCount: state.readyCount,
      recovery: 'awaiting-ready',
      confirmationDeadlineAt: null,
    }
  }
  if (event.type === 'browser-online') return { ...state, browserOnline: true }
  if (event.type === 'observed') return observeReady(state, event.observation, event.now)
  if (event.type === 'subscription-confirmed') {
    const afterDisconnect = state.disconnectCount === null
      || event.connectionCount > state.disconnectCount
    if (
      !state.socketConnected
      || event.connectionCount !== state.readyCount
      || !afterDisconnect
    ) return state
    return {
      ...state,
      confirmedCount: event.connectionCount,
      recovery: 'confirmed',
      confirmationDeadlineAt: null,
    }
  }
  if (event.type === 'confirmation-timeout') {
    if (
      state.recovery !== 'awaiting-subscription'
      || state.readyCount !== event.connectionCount
      || state.confirmationDeadlineAt === null
      || event.now < state.confirmationDeadlineAt
    ) return state
    return { ...state, recovery: 'unconfirmed', confirmationDeadlineAt: null }
  }
  return {
    ...state,
    socketConnected: false,
    disconnectCount: state.readyCount,
    recovery: 'awaiting-ready',
    confirmationDeadlineAt: null,
  }
}

export function deriveConnectionMode(state: ConnectionTracker): ConnectionMode {
  if (!state.mounted) return 'connecting'
  if (!state.browserOnline) return 'offline'
  if (
    state.socketConnected
    && state.recovery === 'confirmed'
    && state.confirmedCount === state.readyCount
  ) return 'online'
  return state.hasEverConnected ? 'reconnecting' : 'connecting'
}

export function needsConnectionRecreate(state: ConnectionTracker): boolean {
  return state.recovery === 'unconfirmed'
}
