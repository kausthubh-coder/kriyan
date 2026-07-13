import type {
  ActionResult,
  ActivityItem,
  CommandItem,
  InstallationItem,
  JobItem,
  NodeItem,
  PageState,
  ReminderItem,
  ReminderStatus,
  RunEventItem,
  TaskItem,
  TaskStatus,
} from './types'

export const PAGE_SIZE = 25

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
  activity: ActivityItem[]
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
