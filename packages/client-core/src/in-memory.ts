import { createActivityAdapter, type ActivityAdapter } from './activity-adapter'
import type { ClientRepository } from './repository'
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

export function createInMemoryActivityAdapter(): ActivityAdapter {
  return createActivityAdapter()
}

const exhaustedPage = (loadedCount = 0): PageState => ({
  canLoadMore: false,
  loadingMore: false,
  loadedCount,
})

function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value }
}

function stale(): ActionResult<never> {
  return {
    ok: false,
    reason: 'stale_revision',
    message: 'This changed somewhere else. Your edit was rolled back to the latest version.',
  }
}

export class InMemoryClientRepository implements ClientRepository {
  installation: InstallationItem
  tasks: TaskItem[] = []
  reminders: ReminderItem[] = []
  activity: ActivityItem[] = []
  nodes: NodeItem[] = []
  runEvents: RunEventItem[] = []
  loading = false
  loadingRunEvents = false
  pending: ReadonlySet<string> = new Set()
  pages = {
    openTasks: exhaustedPage(),
    completedTasks: exhaustedPage(),
    reminders: exhaustedPage(),
    activity: exhaustedPage(),
    runEvents: exhaustedPage(),
  }

  private sequence = 0

  constructor(installation?: Partial<InstallationItem>) {
    this.installation = {
      installationId: 'installation:memory',
      timezone: 'UTC',
      protocolVersion: '1',
      createdAt: 0,
      updatedAt: 0,
      ...installation,
    }
  }

  loadMore(): void {}
  selectRun(): void {}

  async submitCommand(input: string): Promise<ActionResult<{ commandId: string }>> {
    const createdAt = ++this.sequence
    const command: CommandItem = {
      commandId: `command:memory:${createdAt}`,
      input,
      status: 'accepted',
      revision: 0,
      createdAt,
      updatedAt: createdAt,
    }
    const job: JobItem = {
      jobId: `job:${command.commandId}`,
      commandId: command.commandId,
      status: 'queued',
      attempt: 0,
      maxAttempts: 3,
      revision: 0,
      createdAt,
      updatedAt: createdAt,
    }
    this.activity = [{ command, job, state: 'queued', isFake: false }, ...this.activity]
    this.refreshPages()
    return ok({ commandId: command.commandId })
  }

  async cancelCommand(command: CommandItem): Promise<ActionResult> {
    const item = this.activity.find((candidate) => candidate.command.commandId === command.commandId)
    if (!item || item.command.revision !== command.revision) return stale()
    item.command = { ...item.command, status: 'cancelled', revision: item.command.revision + 1 }
    if (item.job) item.job = { ...item.job, status: 'cancelled', revision: item.job.revision + 1 }
    item.state = 'cancelled'
    return ok(undefined)
  }

  async retryCommand(command: CommandItem, job: JobItem): Promise<ActionResult> {
    const item = this.activity.find((candidate) => candidate.command.commandId === command.commandId)
    if (!item || item.command.revision !== command.revision || item.job?.revision !== job.revision) return stale()
    if (job.attempt >= job.maxAttempts) {
      return { ok: false, reason: 'attempts_exhausted', message: 'Retry is unavailable because this job used all of its attempts.' }
    }
    item.command = { ...item.command, status: 'accepted', revision: item.command.revision + 1 }
    item.job = { ...job, status: 'queued', revision: job.revision + 1, lastError: undefined }
    item.state = 'queued'
    return ok(undefined)
  }

  async createTask(input: { title: string; dueAt?: number }): Promise<ActionResult<TaskItem>> {
    const createdAt = ++this.sequence
    const task: TaskItem = { taskId: `task:memory:${createdAt}`, status: 'open', revision: 0, createdAt, updatedAt: createdAt, ...input }
    this.tasks = [...this.tasks, task]
    this.refreshPages()
    return ok(task)
  }

  async updateTask(task: TaskItem, patch: { title?: string; dueAt?: number }): Promise<ActionResult> {
    return this.updateTaskEntity(task, patch)
  }

  async setTaskStatus(task: TaskItem, status: TaskStatus): Promise<ActionResult> {
    return this.updateTaskEntity(task, { status })
  }

  async cancelTask(task: TaskItem): Promise<ActionResult> {
    return this.updateTaskEntity(task, { status: 'cancelled' })
  }

  async createReminder(input: { message: string; remindAt: number; timezone: string }): Promise<ActionResult<ReminderItem>> {
    const createdAt = ++this.sequence
    const reminder: ReminderItem = { reminderId: `reminder:memory:${createdAt}`, status: 'scheduled', revision: 0, createdAt, updatedAt: createdAt, ...input }
    this.reminders = [...this.reminders, reminder]
    this.refreshPages()
    return ok(reminder)
  }

  async updateReminder(reminder: ReminderItem, patch: { message?: string; remindAt?: number }): Promise<ActionResult> {
    return this.updateReminderEntity(reminder, patch)
  }

  async setReminderStatus(reminder: ReminderItem, status: ReminderStatus): Promise<ActionResult> {
    return this.updateReminderEntity(reminder, { status })
  }

  async cancelReminder(reminder: ReminderItem): Promise<ActionResult> {
    return this.updateReminderEntity(reminder, { status: 'cancelled' })
  }

  private updateTaskEntity(task: TaskItem, patch: Partial<TaskItem>): ActionResult {
    const index = this.tasks.findIndex((candidate) => candidate.taskId === task.taskId)
    const current = this.tasks[index]
    if (!current || current.revision !== task.revision) return stale()
    this.tasks[index] = { ...current, ...patch, revision: current.revision + 1, updatedAt: ++this.sequence }
    this.tasks = [...this.tasks]
    this.refreshPages()
    return ok(undefined)
  }

  private updateReminderEntity(reminder: ReminderItem, patch: Partial<ReminderItem>): ActionResult {
    const index = this.reminders.findIndex((candidate) => candidate.reminderId === reminder.reminderId)
    const current = this.reminders[index]
    if (!current || current.revision !== reminder.revision) return stale()
    this.reminders[index] = { ...current, ...patch, revision: current.revision + 1, updatedAt: ++this.sequence }
    this.reminders = [...this.reminders]
    this.refreshPages()
    return ok(undefined)
  }

  private refreshPages(): void {
    this.pages = {
      openTasks: exhaustedPage(this.tasks.filter((task) => task.status === 'open').length),
      completedTasks: exhaustedPage(this.tasks.filter((task) => task.status === 'completed').length),
      reminders: exhaustedPage(this.reminders.length),
      activity: exhaustedPage(this.activity.length),
      runEvents: exhaustedPage(this.runEvents.length),
    }
  }
}
