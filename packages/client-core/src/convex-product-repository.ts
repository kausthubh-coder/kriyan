import type {
  ProductCalendarRepository,
  ProductArtifactRepository,
  ProductMemoryRepository,
  ProductNoteDetailRepository,
  ProductSourceDetailRepository,
  ProductTaskProvenanceRepository,
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
  readonly noteDetailsV1: ProductNoteDetailRepository
  readonly artifactsV1: ProductArtifactRepository
  readonly sourceDetailsV1: ProductSourceDetailRepository
  readonly memoryV1: ProductMemoryRepository
  readonly taskProvenanceV1: ProductTaskProvenanceRepository
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
  readonly noteDetailsV1: ProductNoteDetailRepository
  readonly artifactsV1: ProductArtifactRepository
  readonly sourceDetailsV1: ProductSourceDetailRepository
  readonly memoryV1: ProductMemoryRepository
  readonly taskProvenanceV1: ProductTaskProvenanceRepository

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
    this.noteDetailsV1 = {
      getHistory: async (id, limit) => await client.noteDetailsV1.getHistory(id, limit),
      getVersion: async (id) => await client.noteDetailsV1.getVersion(id),
      createLink: async (input) => await guard(() => client.noteDetailsV1.createLink(input)),
      tombstoneLink: async (id, revision) => await guard(() => client.noteDetailsV1.tombstoneLink(id, revision)),
    }
    this.artifactsV1 = {
      get: async (id) => await client.artifactsV1.get(id),
      listByNote: async (id, includeDeleted) => await client.artifactsV1.listByNote(id, includeDeleted),
      create: async (input) => await guard(() => client.artifactsV1.create(input)),
      advance: async (input) => await guard(() => client.artifactsV1.advance(input)),
      tombstone: async (id, revision) => await guard(() => client.artifactsV1.tombstone(id, revision)),
    }
    this.sourceDetailsV1 = {
      getDetail: async (id, limits) => await client.sourceDetailsV1.getDetail(id, limits),
      listDerivedChanges: async (id, limit) => await client.sourceDetailsV1.listDerivedChanges(id, limit),
    }
    this.memoryV1 = {
      getEntity: async (id, limit) => await client.memoryV1.getEntity(id, limit),
      createCorrection: async (input) => await guard(() => client.memoryV1.createCorrection(input)),
      applyCorrection: async (id, revision) => await guard(() => client.memoryV1.applyCorrection(id, revision)),
      restoreCorrection: async (id, revision) => await guard(() => client.memoryV1.restoreCorrection(id, revision)),
    }
    this.taskProvenanceV1 = {
      getDetail: async (id) => await client.taskProvenanceV1.getDetail(id),
      listChanges: async (id, limit) => await client.taskProvenanceV1.listChanges(id, limit),
      revertChange: async (id, revision) => await guard(() => client.taskProvenanceV1.revertChange(id, revision)),
    }
  }
}
