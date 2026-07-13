import { activityAdapterContract } from '../testing/activity-adapter-contract'
import { repositoryBehaviorContract } from '../testing/repository-contract'
import { createInMemoryActivityAdapter, InMemoryClientRepository } from './in-memory'

activityAdapterContract('in-memory', createInMemoryActivityAdapter)
repositoryBehaviorContract('in-memory', () => new InMemoryClientRepository())
