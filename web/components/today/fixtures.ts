import type { ReminderItem, TaskItem } from '@/src/client-core/types'
import type { ActivityItem } from '@/src/client-core/view-model'

export const taskFixture: TaskItem = {
  taskId: 'task:fixture', title: 'Practice Korean', status: 'open', dueAt: 1_800_000_000_000,
  revision: 1, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
}

export const reminderFixture: ReminderItem = {
  reminderId: 'reminder:fixture', message: 'Practice Korean', remindAt: 1_800_000_000_000,
  timezone: 'America/New_York', status: 'scheduled', revision: 1,
  createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
}

export const queuedActivityFixture: ActivityItem = {
  command: {
    commandId: 'command:fixture', input: 'remind me tomorrow at 8 to practice Korean',
    status: 'accepted', revision: 0, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
  },
  job: {
    jobId: 'job:fixture', commandId: 'command:fixture', status: 'queued', attempt: 0,
    maxAttempts: 3, revision: 0, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
  },
  state: 'queued',
  isFake: false,
}
