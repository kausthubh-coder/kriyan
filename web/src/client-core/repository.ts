import type {
  ActionResult,
  CommandItem,
  InstallationItem,
  JobItem,
  NodeItem,
  PageState,
  ReminderItem,
  ReminderStatus,
  RunEventItem,
  RunItem,
  TaskItem,
  TaskStatus,
} from './types'

export type SubscriptionName =
  | 'installation'
  | 'openTasks'
  | 'completedTasks'
  | 'scheduledReminders'
  | 'recentReminders'
  | 'commands'
  | 'jobs'
  | 'runs'
  | 'nodes'
  | 'runEvents'

export interface SubscriptionDescriptor<TName extends SubscriptionName = SubscriptionName> {
  name: TName
  order: 'due-ascending' | 'time-ascending' | 'newest-loaded-first' | 'sequence-ascending' | 'stable-id'
  paginated: boolean
  pageSize: number
}

export const SUBSCRIPTIONS = {
  installation: { name: 'installation', order: 'stable-id', paginated: false, pageSize: 1 },
  openTasks: { name: 'openTasks', order: 'due-ascending', paginated: true, pageSize: 25 },
  completedTasks: { name: 'completedTasks', order: 'due-ascending', paginated: true, pageSize: 25 },
  scheduledReminders: { name: 'scheduledReminders', order: 'time-ascending', paginated: true, pageSize: 25 },
  recentReminders: { name: 'recentReminders', order: 'time-ascending', paginated: true, pageSize: 25 },
  commands: { name: 'commands', order: 'newest-loaded-first', paginated: true, pageSize: 25 },
  jobs: { name: 'jobs', order: 'stable-id', paginated: true, pageSize: 25 },
  runs: { name: 'runs', order: 'stable-id', paginated: true, pageSize: 25 },
  nodes: { name: 'nodes', order: 'stable-id', paginated: true, pageSize: 25 },
  runEvents: { name: 'runEvents', order: 'sequence-ascending', paginated: true, pageSize: 50 },
} as const satisfies Record<SubscriptionName, SubscriptionDescriptor>

export interface CreateTaskInput {
  taskId: string
  idempotencyKey: string
  title: string
  dueAt?: number
}

export interface CreateReminderInput {
  reminderId: string
  idempotencyKey: string
  message: string
  remindAt: number
  timezone: string
}

export interface ClientRepository {
  installation: InstallationItem | null | undefined
  tasks: TaskItem[]
  reminders: ReminderItem[]
  commands: CommandItem[]
  jobs: JobItem[]
  runs: RunItem[]
  nodes: NodeItem[]
  runEvents: RunEventItem[]
  loading: boolean
  loadingRunEvents: boolean
  pending: ReadonlySet<string>
  pages: {
    openTasks: PageState
    completedTasks: PageState
    reminders: PageState
    activity: PageState
    runEvents: PageState
  }
  loadMore(name: keyof ClientRepository['pages']): void
  selectRun(runId: string | null): void
  submitCommand(input: string): Promise<ActionResult<{ commandId: string }>>
  cancelCommand(command: CommandItem): Promise<ActionResult>
  retryCommand(command: CommandItem, job: JobItem): Promise<ActionResult>
  createTask(input: Omit<CreateTaskInput, 'taskId' | 'idempotencyKey'>): Promise<ActionResult<TaskItem>>
  updateTask(task: TaskItem, patch: { title?: string; dueAt?: number }): Promise<ActionResult>
  setTaskStatus(task: TaskItem, status: TaskStatus): Promise<ActionResult>
  cancelTask(task: TaskItem): Promise<ActionResult>
  createReminder(input: Omit<CreateReminderInput, 'reminderId' | 'idempotencyKey'>): Promise<ActionResult<ReminderItem>>
  updateReminder(reminder: ReminderItem, patch: { message?: string; remindAt?: number }): Promise<ActionResult>
  setReminderStatus(reminder: ReminderItem, status: ReminderStatus): Promise<ActionResult>
  cancelReminder(reminder: ReminderItem): Promise<ActionResult>
}

export function createClientId(prefix: string, uuid = crypto.randomUUID()): string {
  return `${prefix}:${uuid}`
}
