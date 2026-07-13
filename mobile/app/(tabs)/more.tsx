import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { Card, ConnectionBanner, Screen, SectionHeader, uiStyles } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

const destinations = [
  { href: '/reminders' as const, title: 'Reminders', detail: 'Schedule, snooze, acknowledge', icon: 'notifications-outline' as const },
  { href: '/notes' as const, title: 'Notes', detail: 'TipTap-compatible capture', icon: 'document-text-outline' as const },
  { href: '/knowledge' as const, title: 'Knowledge', detail: 'Sources, entities, provenance', icon: 'library-outline' as const },
  { href: '/settings' as const, title: 'Settings', detail: 'Data mode and notification limits', icon: 'settings-outline' as const },
]

export default function MoreScreen() {
  const colors = Colors[useColorScheme() ?? 'light']
  return <Screen><ConnectionBanner /><SectionHeader title="Library & controls" />{destinations.map((item) => <Link key={item.href} href={item.href} asChild><Pressable accessibilityRole="button" accessibilityLabel={item.title}><Card><View style={uiStyles.row}><View style={[uiStyles.iconButton, { backgroundColor: colors.background }]}><Ionicons name={item.icon} size={23} color={colors.primary} /></View><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{item.title}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{item.detail}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></View></Card></Pressable></Link>)}</Screen>
}
