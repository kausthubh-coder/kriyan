import { createActivityAdapter, type ActivityAdapter } from '@kriyan/client-core'

export function createConvexActivityAdapter(): ActivityAdapter {
  return createActivityAdapter()
}
