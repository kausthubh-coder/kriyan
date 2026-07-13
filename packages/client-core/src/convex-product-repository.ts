import type {
  ProductCalendarRepository,
  ProductKnowledgeRepository,
  ProductMutationResult,
  ProductNotificationIntentRepository,
  ProductNoteRepository,
  ProductReminderRepository,
  ProductRepository,
  ProductSourceRefRepository,
  ProductTaskRepository,
} from './product-repository'

/**
 * Framework adapters implement this narrow contract with generated Convex
 * function references. Product clients depend on ProductRepository instead of
 * importing those references directly.
 */
export interface InjectedConvexProductClient {
  readonly tasksV1: ProductTaskRepository
  readonly remindersV1: ProductReminderRepository
  readonly notificationIntentsV1: ProductNotificationIntentRepository
  readonly calendarV1: ProductCalendarRepository
  readonly notesV1: ProductNoteRepository
  readonly sourceRefsV1: ProductSourceRefRepository
  readonly knowledgeV1: ProductKnowledgeRepository
}

function transportFailure<T>(error: unknown): ProductMutationResult<T> {
  return {
    ok: false,
    reason: 'transport_error',
    message: error instanceof Error ? error.message : 'Convex transport failed.',
  }
}

async function guard<T>(operation: () => Promise<ProductMutationResult<T>>): Promise<ProductMutationResult<T>> {
  try {
    return await operation()
  } catch (error) {
    return transportFailure(error)
  }
}

export class ConvexProductRepository implements ProductRepository {
  readonly tasksV1: ProductTaskRepository
  readonly remindersV1: ProductReminderRepository
  readonly notificationIntentsV1: ProductNotificationIntentRepository
  readonly calendarV1: ProductCalendarRepository
  readonly notesV1: ProductNoteRepository
  readonly sourceRefsV1: ProductSourceRefRepository
  readonly knowledgeV1: ProductKnowledgeRepository

  constructor(client: InjectedConvexProductClient) {
    this.tasksV1 = {
      list: async (filter) => await client.tasksV1.list(filter),
      create: async (input) => await guard(() => client.tasksV1.create(input)),
      update: async (input) => await guard(() => client.tasksV1.update(input)),
      tombstone: async (id, revision) => await guard(() => client.tasksV1.tombstone(id, revision)),
    }
    this.remindersV1 = {
      list: async (filter) => await client.remindersV1.list(filter),
      create: async (input) => await guard(() => client.remindersV1.create(input)),
      update: async (input) => await guard(() => client.remindersV1.update(input)),
      acknowledge: async (id, revision) => await guard(() => client.remindersV1.acknowledge(id, revision)),
      snooze: async (id, revision, nextFireAt) => await guard(() => client.remindersV1.snooze(id, revision, nextFireAt)),
      tombstone: async (id, revision) => await guard(() => client.remindersV1.tombstone(id, revision)),
    }
    this.notificationIntentsV1 = {
      list: async (filter) => await client.notificationIntentsV1.list(filter),
      create: async (input) => await guard(() => client.notificationIntentsV1.create(input)),
      transition: async (input) => await guard(() => client.notificationIntentsV1.transition(input)),
      tombstone: async (id, revision) => await guard(() => client.notificationIntentsV1.tombstone(id, revision)),
    }
    this.calendarV1 = {
      list: async (filter) => await client.calendarV1.list(filter),
      create: async (input) => await guard(() => client.calendarV1.create(input)),
      update: async (input) => await guard(() => client.calendarV1.update(input)),
      tombstone: async (id, revision) => await guard(() => client.calendarV1.tombstone(id, revision)),
    }
    this.notesV1 = {
      list: async (filter) => await client.notesV1.list(filter),
      create: async (input) => await guard(() => client.notesV1.create(input)),
      update: async (input) => await guard(() => client.notesV1.update(input)),
      tombstone: async (id, revision) => await guard(() => client.notesV1.tombstone(id, revision)),
    }
    this.sourceRefsV1 = {
      list: async (filter) => await client.sourceRefsV1.list(filter),
      put: async (input) => await guard(() => client.sourceRefsV1.put(input)),
      update: async (input) => await guard(() => client.sourceRefsV1.update(input)),
      tombstone: async (id, revision) => await guard(() => client.sourceRefsV1.tombstone(id, revision)),
    }
    this.knowledgeV1 = {
      list: async (filter) => await client.knowledgeV1.list(filter),
      put: async (input) => await guard(() => client.knowledgeV1.put(input)),
      update: async (input) => await guard(() => client.knowledgeV1.update(input)),
      tombstone: async (id, revision) => await guard(() => client.knowledgeV1.tombstone(id, revision)),
    }
  }
}
