import type { ReminderDeliveryPolicy } from '@kriyan/client-core'

export interface LocalNotificationRecord {
  intentKey: string
  nativeId: string
  scheduledFor: number
  deliveryPolicy: ReminderDeliveryPolicy
}

export class NotificationIntentRegistry {
  private readonly records = new Map<string, LocalNotificationRecord>()

  get(intentKey: string): LocalNotificationRecord | undefined {
    return this.records.get(intentKey)
  }

  remember(record: LocalNotificationRecord): void {
    this.records.set(record.intentKey, record)
  }

  remove(intentKey: string): LocalNotificationRecord | undefined {
    const record = this.records.get(intentKey)
    this.records.delete(intentKey)
    return record
  }

  findByReminder(reminderId: string): LocalNotificationRecord[] {
    const prefix = `reminder:${reminderId}:`
    return [...this.records.values()].filter((record) => record.intentKey.startsWith(prefix))
  }
}

export function channelForPolicy(policy: ReminderDeliveryPolicy): string {
  return policy === 'critical' ? 'critical-reminders' : policy === 'persistent' ? 'persistent-reminders' : 'reminders'
}
