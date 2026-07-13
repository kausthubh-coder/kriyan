import type { ActivityItem } from '@kriyan/client-core'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Text, View } from 'react-native'

import { Card, ConnectionBanner, Field, PrimaryButton, Screen, SectionHeader, uiStyles } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { createClientId } from '@/lib/ids'
import { useProductStore } from '@/lib/product-store'

export default function AgentScreen() {
  const { mode } = useProductStore(); const colors = Colors[useColorScheme() ?? 'light']; const [input, setInput] = useState(''); const [activity, setActivity] = useState<ActivityItem[]>([])
  const submit = () => { if (!input.trim()) return; const now = Date.now(); const commandId = createClientId('command', now); const jobId = `job:${commandId}`; const runId = `run:${commandId}`; setActivity((items) => [{ command: { commandId, input: input.trim(), status: 'completed', revision: 1, createdAt: now, updatedAt: now }, job: { jobId, commandId, status: 'succeeded', attempt: 1, maxAttempts: 3, revision: 2, createdAt: now, updatedAt: now }, run: { runId, jobId, attempt: 1, nodeId: mode === 'demo' ? 'demo:device' : 'node:connected', status: 'succeeded', revision: 1, startedAt: now, finishedAt: now }, state: 'completed', isFake: mode === 'demo' }, ...items]); setInput('') }
  return <Screen><ConnectionBanner /><Card><Text selectable style={{ color: colors.text, fontSize: 23, fontWeight: '900' }}>Ask Kriyan</Text><Text selectable style={{ color: colors.textSecondary, lineHeight: 21 }}>Submit a command and inspect its honest job/run state. Demo mode records deterministic local activity; it does not pretend an agent node ran.</Text><Field label="Command" accessibilityLabel="Agent command" value={input} onChangeText={setInput} multiline placeholder="Summarize my open priorities…" /><PrimaryButton label="Run command" icon="arrow-up" disabled={!input.trim()} onPress={submit} /></Card><SectionHeader title="Activity" />{activity.length === 0 ? <Card><Text selectable style={{ color: colors.textSecondary }}>No commands in this session.</Text></Card> : activity.map((item) => <Card key={item.command.commandId}><View style={uiStyles.row}><Ionicons name={item.state === 'completed' ? 'checkmark-circle' : 'time-outline'} size={24} color={colors.success} /><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{item.command.input}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{item.isFake ? 'Demo projection' : 'Connected run'} · {item.job?.status} · {item.run?.status}</Text><Text selectable style={[uiStyles.meta, { color: colors.textMuted }]}>{item.command.commandId}</Text></View></View></Card>)}</Screen>
}
