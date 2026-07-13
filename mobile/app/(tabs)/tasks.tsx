import type { TaskItem, TaskPriority } from '@kriyan/client-core'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'

import { Card, ConnectionBanner, Field, PrimaryButton, Screen, SectionHeader, uiStyles } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { createClientId } from '@/lib/ids'
import { useProductStore } from '@/lib/product-store'

interface Draft { title: string; description: string; tags: string; priority: TaskPriority; startAt: string; dueAt: string; projectId: string; entityId: string }
const emptyDraft: Draft = { title: '', description: '', tags: '', priority: 'normal', startAt: '', dueAt: '', projectId: '', entityId: '' }
const parseDate = (value: string): number | undefined => value.trim() ? new Date(value).getTime() : undefined
const inputDate = (value?: number): string => value ? new Date(value).toISOString().slice(0, 16) : ''

export default function TasksScreen() {
  const { tasks, runWrite } = useProductStore()
  const colors = Colors[useColorScheme() ?? 'light']
  const [editing, setEditing] = useState<TaskItem | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  const beginEdit = (task: TaskItem) => { setEditing(task); setDraft({ title: task.title, description: task.description ?? '', tags: task.tags?.join(', ') ?? '', priority: task.priority ?? 'normal', startAt: inputDate(task.startAt), dueAt: inputDate(task.dueAt), projectId: task.projectId ?? '', entityId: task.entityId ?? '' }) }
  const beginCreate = () => { setEditing('new'); setDraft(emptyDraft) }
  const save = async () => {
    if (!draft.title.trim()) return Alert.alert('Title required', 'Give this task a short title.')
    const tags = draft.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    const startAt = parseDate(draft.startAt); const dueAt = parseDate(draft.dueAt)
    if ((draft.startAt && Number.isNaN(startAt)) || (draft.dueAt && Number.isNaN(dueAt))) return Alert.alert('Check dates', 'Use a date like 2026-07-13 15:30.')
    const result = editing === 'new' ? await runWrite((repo) => { const id = createClientId('task'); return repo.tasksV1.create({ taskId: id, idempotencyKey: `mobile:${id}`, title: draft.title.trim(), description: draft.description.trim() || undefined, tags, priority: draft.priority, startAt, dueAt, projectId: draft.projectId.trim() || undefined, entityId: draft.entityId.trim() || undefined }) }) : editing ? await runWrite((repo) => repo.tasksV1.update({ taskId: editing.taskId, expectedRevision: editing.revision, patch: { title: draft.title.trim(), description: draft.description.trim() || null, tags, priority: draft.priority, startAt: startAt ?? null, dueAt: dueAt ?? null, projectId: draft.projectId.trim() || null, entityId: draft.entityId.trim() || null } })) : null
    if (result?.ok) setEditing(null)
  }
  return <Screen><ConnectionBanner /><SectionHeader title="Tasks" action={editing ? 'Cancel' : 'Add'} onAction={editing ? () => setEditing(null) : beginCreate} />
    {editing ? <Card><Field label="Title" accessibilityLabel="Task title" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="What needs doing?" /><Field label="Description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline placeholder="Context and outcome" /><Field label="Tags" value={draft.tags} onChangeText={(tags) => setDraft({ ...draft, tags })} placeholder="work, focus" /><View style={uiStyles.actions}>{(['low', 'normal', 'high', 'urgent'] as const).map((priority) => <Pressable key={priority} accessibilityRole="button" onPress={() => setDraft({ ...draft, priority })} style={[uiStyles.chip, { backgroundColor: draft.priority === priority ? colors.primary : colors.background }]}><Text style={{ color: draft.priority === priority ? '#fff' : colors.text }}>{priority}</Text></Pressable>)}</View><Field label="Starts" value={draft.startAt} onChangeText={(startAt) => setDraft({ ...draft, startAt })} placeholder="2026-07-13 09:00" /><Field label="Due" value={draft.dueAt} onChangeText={(dueAt) => setDraft({ ...draft, dueAt })} placeholder="2026-07-13 17:00" /><Field label="Project ID" value={draft.projectId} onChangeText={(projectId) => setDraft({ ...draft, projectId })} placeholder="project:personal" /><Field label="Entity ID" value={draft.entityId} onChangeText={(entityId) => setDraft({ ...draft, entityId })} placeholder="entity:weekly-plan" /><PrimaryButton label={editing === 'new' ? 'Create task' : 'Save task'} icon="checkmark" onPress={() => void save()} /></Card> : null}
    {tasks.map((task) => <Card key={task.taskId}><View style={uiStyles.row}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.status === 'completed' }} accessibilityLabel={`${task.status === 'completed' ? 'Reopen' : 'Complete'} ${task.title}`} onPress={() => void runWrite((repo) => repo.tasksV1.update({ taskId: task.taskId, expectedRevision: task.revision, patch: { status: task.status === 'completed' ? 'open' : 'completed' } }))} style={uiStyles.iconButton}><Ionicons name={task.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'} size={27} color={task.status === 'completed' ? colors.success : colors.primary} /></Pressable><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text, textDecorationLine: task.status === 'completed' ? 'line-through' : 'none' }]}>{task.title}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{task.priority ?? 'normal'} · revision {task.revision}{task.tags?.length ? ` · ${task.tags.map((tag) => `#${tag}`).join(' ')}` : ''}</Text>{task.description ? <Text selectable numberOfLines={2} style={{ color: colors.textSecondary }}>{task.description}</Text> : null}</View><Pressable accessibilityLabel={`Edit ${task.title}`} onPress={() => beginEdit(task)} style={uiStyles.iconButton}><Ionicons name="pencil" size={20} color={colors.primary} /></Pressable><Pressable accessibilityLabel={`Delete ${task.title}`} onPress={() => Alert.alert('Delete task?', task.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void runWrite((repo) => repo.tasksV1.tombstone(task.taskId, task.revision)) }])} style={uiStyles.iconButton}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable></View></Card>)}
  </Screen>
}
