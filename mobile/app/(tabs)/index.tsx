import { Ionicons } from '@expo/vector-icons'
import { Text, View } from 'react-native'

import { Card, ConnectionBanner, EmptyState, Screen, SectionHeader, uiStyles } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useProductStore } from '@/lib/product-store'

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

export default function TodayScreen() {
  const { tasks, reminders, events } = useProductStore()
  const colors = Colors[useColorScheme() ?? 'light']
  const open = tasks.filter((task) => task.status === 'open').slice(0, 3)
  const nextReminder = reminders.find((reminder) => reminder.status === 'scheduled')
  return <Screen>
    <ConnectionBanner />
    <Card><Text selectable style={{ color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 }}>Make today deliberate.</Text><Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>Your confirmed work, schedule, and reminders in one calm view.</Text><View style={[uiStyles.row, { justifyContent: 'space-between' }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>{open.length} open priorities</Text><Text style={{ color: colors.textSecondary }}>{events.length} calendar items</Text></View></Card>
    <SectionHeader title="Next up" />
    {open.length === 0 ? <EmptyState icon="checkmark-done" title="Clear runway" detail="No open tasks are waiting." /> : open.map((task) => <Card key={task.taskId}><View style={uiStyles.row}><Ionicons name="checkmark-circle-outline" size={24} color={colors.primary} /><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{task.title}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{task.dueAt ? `Due ${formatTime(task.dueAt)}` : 'No due time'} · {task.priority ?? 'normal'} priority</Text></View></View></Card>)}
    <SectionHeader title="Reminder" />
    {nextReminder ? <Card><View style={uiStyles.row}><Ionicons name="notifications-outline" size={24} color={colors.warning} /><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{nextReminder.message}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{formatTime(nextReminder.nextFireAt ?? nextReminder.remindAt)} · {nextReminder.deliveryPolicy ?? 'normal'}</Text></View></View></Card> : <EmptyState icon="notifications-off-outline" title="No reminder queued" detail="Add one from More → Reminders." />}
  </Screen>
}
