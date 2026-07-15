import * as Notifications from 'expo-notifications'
import { useState } from 'react'
import { Text } from 'react-native'

import { Card, ConnectionBanner, PrimaryButton, Screen, SectionHeader } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ensureNotificationPermission } from '@/lib/notifications'
import { useProductStore } from '@/lib/product-store'

export default function SettingsScreen() {
  const { mode } = useProductStore(); const colors = Colors[useColorScheme() ?? 'light']; const [permission, setPermission] = useState<string>('not checked')
  const request = async () => { const granted = await ensureNotificationPermission(); const status = await Notifications.getPermissionsAsync(); setPermission(granted ? 'granted' : status.status) }
  return <Screen><ConnectionBanner /><SectionHeader title="Data" /><Card><Text selectable style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{mode === 'demo' ? 'Persistent local mode' : 'Convex-backed mode'}</Text><Text selectable style={{ color: colors.textSecondary, lineHeight: 21 }}>{mode === 'demo' ? 'EXPO_PUBLIC_CONVEX_URL is absent. Your tasks, notes, reminders, calendar, and knowledge stay on this device between app launches.' : 'The configured public Convex deployment is used. Last confirmed lists remain visible if refresh fails.'}</Text></Card><SectionHeader title="Notifications" /><Card><Text selectable style={{ color: colors.text, fontWeight: '700' }}>Permission: {permission}</Text><Text selectable style={{ color: colors.textSecondary, lineHeight: 21 }}>Kriyan schedules and cancels local notifications and deduplicates them by reminder/time intent key. Android channels map normal, persistent, and critical intent to increasing importance.</Text><Text selectable style={{ color: colors.warning, lineHeight: 21 }}>Native gap: this client does not implement a foreground service, full-screen alarm, exact-alarm guarantee, or guaranteed delivery. OS power and permission policy still apply.</Text><PrimaryButton label="Check notification permission" icon="notifications" onPress={() => void request()} /></Card></Screen>
}
