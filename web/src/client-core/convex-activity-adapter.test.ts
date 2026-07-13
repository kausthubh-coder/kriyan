import { activityAdapterContract } from '@kriyan/client-core/testing'

import { createConvexActivityAdapter } from './convex-activity-adapter'

activityAdapterContract('Convex projection', createConvexActivityAdapter)
