import type {
  ReminderItem,
  ReminderStatus,
  TaskItem,
  TaskStatus,
  TransitionResult,
} from './types'

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
  submitCommand(input: string): Promise<{ commandId: string }>
  createTask(input: CreateTaskInput): Promise<TaskItem>
  updateTask(task: TaskItem, patch: { title?: string; dueAt?: number }): Promise<TransitionResult>
  setTaskStatus(task: TaskItem, status: TaskStatus): Promise<TransitionResult>
  cancelTask(task: TaskItem): Promise<TransitionResult>
  createReminder(input: CreateReminderInput): Promise<ReminderItem>
  updateReminder(reminder: ReminderItem, patch: { message?: string; remindAt?: number }): Promise<TransitionResult>
  setReminderStatus(reminder: ReminderItem, status: ReminderStatus): Promise<TransitionResult>
  cancelReminder(reminder: ReminderItem): Promise<TransitionResult>
}

export function createClientId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`
}
