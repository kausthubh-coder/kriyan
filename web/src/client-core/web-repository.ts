import type {
  ActionResult,
  AppNoteItem,
  CalendarEventItem,
  ClientRepository,
  KnowledgeDocumentItem,
  PageState,
  ProductDetailRepository,
  ReminderDeliveryPolicy,
  ReminderItem,
  SourceRefItem,
  TaskItem,
  TaskPriority,
} from '@kriyan/client-core'

export interface TaskDraft {
  title: string
  description?: string
  tags?: string[]
  priority?: TaskPriority
  startAt?: number
  dueAt?: number
  projectId?: string
  entityId?: string
}

export interface ReminderDraft {
  message: string
  remindAt: number
  timezone: string
  deliveryPolicy?: ReminderDeliveryPolicy
  linkedTaskId?: string
  entityId?: string
}

export interface CalendarDraft {
  title: string
  description?: string
  startAt: number
  endAt: number
  timezone: string
  allDay: boolean
  location?: string
  sourceUrl?: string
}

export interface NoteDraft {
  title?: string
  contentJson: string
  plainTextPreview: string
  wordCount: number
  tags: string[]
  entityId?: string
}

export type WebPages = ClientRepository['pages'] & {
  calendar: PageState
  notes: PageState
  sources: PageState
  knowledge: PageState
}

export interface WebRepository extends ProductDetailRepository, Omit<
  ClientRepository,
  | 'pages'
  | 'loadMore'
  | 'createTask'
  | 'updateTask'
  | 'createReminder'
  | 'updateReminder'
> {
  calendarEvents: CalendarEventItem[]
  notes: AppNoteItem[]
  sourceRefs: SourceRefItem[]
  knowledgeDocuments: KnowledgeDocumentItem[]
  pages: WebPages
  loadMore(name: keyof WebPages): void
  createTask(input: TaskDraft): Promise<ActionResult<TaskItem>>
  updateTask(task: TaskItem, patch: TaskDraft): Promise<ActionResult>
  createReminder(input: ReminderDraft): Promise<ActionResult<ReminderItem>>
  updateReminder(reminder: ReminderItem, patch: ReminderDraft): Promise<ActionResult>
  acknowledgeReminder(reminder: ReminderItem): Promise<ActionResult>
  snoozeReminder(reminder: ReminderItem, nextFireAt: number): Promise<ActionResult>
  createCalendarEvent(input: CalendarDraft): Promise<ActionResult<CalendarEventItem>>
  updateCalendarEvent(event: CalendarEventItem, patch: CalendarDraft): Promise<ActionResult>
  deleteCalendarEvent(event: CalendarEventItem): Promise<ActionResult>
  createNote(input: NoteDraft): Promise<ActionResult<AppNoteItem>>
  updateNote(note: AppNoteItem, patch: NoteDraft): Promise<ActionResult>
  deleteNote(note: AppNoteItem): Promise<ActionResult>
}

export function exhaustedPage(loadedCount = 0): PageState {
  return { canLoadMore: false, loadingMore: false, loadedCount }
}
