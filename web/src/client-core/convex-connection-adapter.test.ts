import { describe, expect, test } from 'bun:test'

import { observeConvexConnection } from './convex-connection-adapter'

describe('Convex 1.42 connection adapter', () => {
  test('preserves the real ready generation instead of reducing it to a socket boolean', () => {
    expect(observeConvexConnection({
      connectionCount: 8,
      hasEverConnected: true,
      isWebSocketConnected: true,
    })).toEqual({
      connectionCount: 8,
      hasEverConnected: true,
      isWebSocketConnected: true,
    })
  })
})
