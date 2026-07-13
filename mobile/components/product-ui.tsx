import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native'

import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useProductStore } from '@/lib/product-store'

export function Screen({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() ?? 'light'
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ backgroundColor: Colors[scheme].background }} contentContainerStyle={styles.screen}>{children}</ScrollView>
}

export function ConnectionBanner() {
  const { connection, error, mode, refresh } = useProductStore()
  const scheme = useColorScheme() ?? 'light'
  const colors = Colors[scheme]
  if (connection === 'online' && !error) return <View style={[styles.modePill, { backgroundColor: colors.surface }]}><View style={[styles.dot, { backgroundColor: colors.success }]} /><Text style={{ color: colors.textSecondary }}>{mode === 'demo' ? 'Demo data · local only' : 'Convex · synced'}</Text></View>
  return <Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.banner, { borderColor: colors.warning }]}><Ionicons name="cloud-offline-outline" size={18} color={colors.warning} /><Text style={{ color: colors.text, flex: 1 }}>{error ?? (connection === 'connecting' ? 'Connecting…' : 'Reconnecting…')}</Text>{connection === 'connecting' ? <ActivityIndicator size="small" /> : <Text style={{ color: colors.primary }}>Retry</Text>}</Pressable>
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = Colors[useColorScheme() ?? 'light']
  return <View style={styles.sectionHeader}><Text selectable style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.textButton}><Text style={{ color: colors.primary, fontWeight: '700' }}>{action}</Text></Pressable> : null}</View>
}

export function Card({ children }: { children: ReactNode }) {
  const colors = Colors[useColorScheme() ?? 'light']
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
}

export function Field(props: TextInputProps & { label: string }) {
  const colors = Colors[useColorScheme() ?? 'light']
  return <View style={{ gap: 6 }}><Text style={[styles.label, { color: colors.textSecondary }]}>{props.label}</Text><TextInput {...props} placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }, props.multiline && styles.multiline, props.style]} /></View>
}

export function PrimaryButton({ label, onPress, icon = 'add', disabled = false }: { label: string; onPress(): void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean }) {
  const colors = Colors[useColorScheme() ?? 'light']
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}><Ionicons name={icon} size={19} color="#fff" /><Text style={styles.primaryLabel}>{label}</Text></Pressable>
}

export function EmptyState({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  const colors = Colors[useColorScheme() ?? 'light']
  return <Card><View style={styles.empty}><Ionicons name={icon} size={30} color={colors.primary} /><Text selectable style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text selectable style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>{detail}</Text></View></Card>
}

export const uiStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, grow: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 13, lineHeight: 18 },
  chip: { minHeight: 30, borderRadius: 16, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
})

const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 36, gap: 16 }, card: { padding: 16, borderWidth: 1, borderRadius: 18, gap: 12 },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }, textButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  modePill: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 34, borderRadius: 18, paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 }, banner: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 13, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 16 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }, primaryButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryLabel: { color: '#fff', fontWeight: '800', fontSize: 15 }, empty: { alignItems: 'center', paddingVertical: 12, gap: 8 }, emptyTitle: { fontSize: 17, fontWeight: '800' },
})
