import type { ReminderDeliveryPolicy } from '@kriyan/client-core'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'

import { channelForPolicy, NotificationIntentRegistry } from '@/lib/notification-intents'
import { notificationIntentKey } from '@/lib/ids'

const registry = new NotificationIntentRegistry()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }),
})

export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Promise.all([
    Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT }),
    Notifications.setNotificationChannelAsync('persistent-reminders', { name: 'Persistent reminders', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 200, 250] }),
    Notifications.setNotificationChannelAsync('critical-reminders', { name: 'Critical reminders', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 500, 250, 500] }),
  ])
}

export async function ensureNotificationPermission(): Promise<boolean> {
  await configureNotificationChannels()
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  const requested = await Notifications.requestPermissionsAsync()
  return requested.granted
}

export async function scheduleReminderNotification(input: {
  reminderId: string
  message: string
  scheduledFor: number
  deliveryPolicy: ReminderDeliveryPolicy
}): Promise<{ ok: true; intentKey: string; nativeId: string; reused: boolean } | { ok: false; message: string }> {
  const intentKey = notificationIntentKey(input.reminderId, input.scheduledFor)
  const existing = registry.get(intentKey)
  if (existing) return { ok: true, intentKey, nativeId: existing.nativeId, reused: true }
  if (!await ensureNotificationPermission()) return { ok: false, message: 'Notification permission was not granted.' }
  const nativeId = await Notifications.scheduleNotificationAsync({
    content: {
      title: input.deliveryPolicy === 'normal' ? 'Kriyan reminder' : `${input.deliveryPolicy === 'critical' ? 'Critical' : 'Persistent'} reminder`,
      body: input.message,
      data: { reminderId: input.reminderId, intentKey, deliveryPolicy: input.deliveryPolicy },
      sound: true,
      priority: input.deliveryPolicy === 'normal' ? Notifications.AndroidNotificationPriority.DEFAULT : Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Math.max(Date.now() + 1_000, input.scheduledFor)), channelId: channelForPolicy(input.deliveryPolicy) },
  })
  registry.remember({ intentKey, nativeId, scheduledFor: input.scheduledFor, deliveryPolicy: input.deliveryPolicy })
  return { ok: true, intentKey, nativeId, reused: false }
}

export async function cancelReminderNotifications(reminderId: string): Promise<void> {
  await Promise.all(registry.findByReminder(reminderId).map(async (record) => {
    registry.remove(record.intentKey)
    await Notifications.cancelScheduledNotificationAsync(record.nativeId)
  }))
}

export function useNotificationResponseObserver(): void {
  const router = useRouter()
  useEffect(() => {
    void configureNotificationChannels()
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (typeof response.notification.request.content.data.reminderId === 'string') router.push('/reminders')
    })
    return () => subscription.remove()
  }, [router])
}
