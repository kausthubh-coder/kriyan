import type { ConnectionMode, ConnectionRecovery } from './types'

export const RECONNECT_CONFIRMATION_TIMEOUT_MS = 15_000

export interface ConnectionObservation {
  isWebSocketConnected: boolean
  hasEverConnected: boolean
  connectionCount: number
}

export interface ConnectionTracker {
  clientGeneration: number
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
  | { type: 'mounted'; browserOnline: boolean; clientGeneration: number; observation: ConnectionObservation; now: number }
  | { type: 'client-replaced'; browserOnline: boolean; clientGeneration: number; now: number }
  | { type: 'browser-offline'; now: number }
  | { type: 'browser-online'; now: number }
  | { type: 'observed'; clientGeneration: number; observation: ConnectionObservation; now: number }
  | { type: 'subscription-confirmed'; clientGeneration: number; connectionCount: number }
  | { type: 'ready-timeout'; clientGeneration: number; connectionCount: number; now: number }
  | { type: 'confirmation-timeout'; clientGeneration: number; connectionCount: number; now: number }

export const INITIAL_CONNECTION_TRACKER: ConnectionTracker = {
  clientGeneration: 0,
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
      : disconnected && state.browserOnline
        ? now + RECONNECT_CONFIRMATION_TIMEOUT_MS
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
          clientGeneration: event.clientGeneration,
          recovery: 'awaiting-subscription',
          confirmationDeadlineAt: event.now + RECONNECT_CONFIRMATION_TIMEOUT_MS,
        }
      : {
          ...mounted,
          clientGeneration: event.clientGeneration,
          disconnectCount: event.observation.connectionCount,
          recovery: 'awaiting-ready',
          confirmationDeadlineAt: event.browserOnline
            ? event.now + RECONNECT_CONFIRMATION_TIMEOUT_MS
            : null,
        }
  }
  if (event.type === 'client-replaced') {
    if (event.clientGeneration <= state.clientGeneration) return state
    return {
      ...INITIAL_CONNECTION_TRACKER,
      clientGeneration: event.clientGeneration,
      mounted: true,
      browserOnline: event.browserOnline,
      hasEverConnected: state.hasEverConnected,
      disconnectCount: 0,
      recovery: 'awaiting-ready',
      confirmationDeadlineAt: event.browserOnline
        ? event.now + RECONNECT_CONFIRMATION_TIMEOUT_MS
        : null,
    }
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
  if (event.type === 'browser-online') {
    return {
      ...state,
      browserOnline: true,
      disconnectCount: state.readyCount,
      recovery: 'awaiting-ready',
      confirmationDeadlineAt: event.now + RECONNECT_CONFIRMATION_TIMEOUT_MS,
    }
  }
  if (event.type === 'observed') {
    if (event.clientGeneration !== state.clientGeneration) return state
    return observeReady(state, event.observation, event.now)
  }
  if (event.type === 'subscription-confirmed') {
    if (event.clientGeneration !== state.clientGeneration) return state
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
  if (event.type === 'ready-timeout') {
    if (
      event.clientGeneration !== state.clientGeneration
      || state.recovery !== 'awaiting-ready'
      || state.readyCount !== event.connectionCount
      || state.confirmationDeadlineAt === null
      || event.now < state.confirmationDeadlineAt
    ) return state
    return { ...state, recovery: 'unconfirmed', confirmationDeadlineAt: null }
  }
  if (event.type === 'confirmation-timeout') {
    if (
      event.clientGeneration !== state.clientGeneration
      || state.recovery !== 'awaiting-subscription'
      || state.readyCount !== event.connectionCount
      || state.confirmationDeadlineAt === null
      || event.now < state.confirmationDeadlineAt
    ) return state
    return { ...state, recovery: 'unconfirmed', confirmationDeadlineAt: null }
  }
  return state
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

export function retainLastConfirmed<T>(
  mode: ConnectionMode,
  current: T,
  lastConfirmed: T | null,
): T {
  return mode === 'online' || lastConfirmed === null ? current : lastConfirmed
}
