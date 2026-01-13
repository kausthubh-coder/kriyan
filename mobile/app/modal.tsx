import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';

// eslint-disable-next-line import/no-unresolved
import { api } from '../convex/_generated/api';
// eslint-disable-next-line import/no-unresolved
import { Id } from '../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

type ModalMode = 'create' | 'edit' | 'view';

export default function ModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string; mode?: ModalMode }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const mode = (params.mode as ModalMode) || 'create';
  const taskId = params.taskId as Id<'tasks'> | undefined;

  // State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Queries & Mutations
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : 'skip');
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const deleteTask = useMutation(api.tasks.remove);
  const completeTask = useMutation(api.tasks.complete);
  const uncompleteTask = useMutation(api.tasks.uncomplete);

  // Load existing task data
  useEffect(() => {
    if (task && mode === 'edit') {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(task.dueDate ? new Date(task.dueDate) : null);
      setDueTime(task.dueTime || '');
      setTags(task.tags);
    }
  }, [task, mode]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'create') {
        await createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate?.getTime(),
          dueTime: dueTime || undefined,
          tags,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (mode === 'edit' && taskId) {
        await updateTask({
          id: taskId,
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate?.getTime(),
          dueTime: dueTime || undefined,
          tags,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!taskId) return;
    
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask({ id: taskId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            Alert.alert('Error', 'Failed to delete task');
          }
        },
      },
    ]);
  };

  const handleToggleComplete = async () => {
    if (!taskId || !task) return;
    
    try {
      if (task.status === 'completed') {
        await uncompleteTask({ id: taskId });
      } else {
        await completeTask({ id: taskId });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert('Error', 'Failed to update task status');
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDueDate(selectedDate);
    }
  };

  const handleTimeChange = (_event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setDueTime(format(selectedTime, 'HH:mm'));
    }
  };

  const isLoading = mode === 'edit' && task === undefined;

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={[styles.headerButton, { color: colors.textSecondary }]}>
              Cancel
            </ThemedText>
          </TouchableOpacity>
          
          <ThemedText style={styles.headerTitle}>
            {mode === 'create' ? 'New Task' : 'Edit Task'}
          </ThemedText>
          
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <ThemedText style={[styles.headerButton, { color: colors.primary }]}>
                Save
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Title</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="What do you need to do?"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
              Description
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add more details..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Due Date */}
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Due Date</ThemedText>
            <TouchableOpacity
              style={[
                styles.input,
                styles.dateInput,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setShowDatePicker(true)}>
              <IconSymbol size={18} name="calendar" color={colors.textSecondary} />
              <ThemedText style={{ color: dueDate ? colors.text : colors.textMuted }}>
                {dueDate ? format(dueDate, 'EEEE, MMMM d, yyyy') : 'Select a date'}
              </ThemedText>
              {dueDate && (
                <TouchableOpacity
                  onPress={() => setDueDate(null)}
                  style={styles.clearButton}>
                  <IconSymbol size={16} name="xmark.circle.fill" color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>

          {/* Due Time */}
          {dueDate && (
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
                Due Time
              </ThemedText>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.dateInput,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setShowTimePicker(true)}>
                <IconSymbol size={18} name="clock" color={colors.textSecondary} />
                <ThemedText style={{ color: dueTime ? colors.text : colors.textMuted }}>
                  {dueTime || 'Select a time'}
                </ThemedText>
                {dueTime && (
                  <TouchableOpacity
                    onPress={() => setDueTime('')}
                    style={styles.clearButton}>
                    <IconSymbol size={16} name="xmark.circle.fill" color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Tags */}
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Tags</ThemedText>
            <View style={styles.tagsInputContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.tagInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add a tag..."
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={handleAddTag}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addTagButton, { backgroundColor: colors.primary }]}
                onPress={handleAddTag}>
                <IconSymbol size={18} name="plus" color="#fff" />
              </TouchableOpacity>
            </View>
            
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tag, { backgroundColor: colors.primary + '20' }]}
                    onPress={() => handleRemoveTag(tag)}>
                    <ThemedText style={[styles.tagText, { color: colors.primary }]}>
                      #{tag}
                    </ThemedText>
                    <IconSymbol size={12} name="xmark" color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Actions for Edit Mode */}
          {mode === 'edit' && task && (
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    backgroundColor:
                      task.status === 'completed' ? colors.warning + '20' : colors.success + '20',
                  },
                ]}
                onPress={handleToggleComplete}>
                <IconSymbol
                  size={18}
                  name={task.status === 'completed' ? 'arrow.uturn.backward' : 'checkmark'}
                  color={task.status === 'completed' ? colors.warning : colors.success}
                />
                <ThemedText
                  style={{
                    color: task.status === 'completed' ? colors.warning : colors.success,
                    fontWeight: '500',
                  }}>
                  {task.status === 'completed' ? 'Mark Incomplete' : 'Mark Complete'}
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                onPress={handleDelete}>
                <IconSymbol size={18} name="trash" color={colors.error} />
                <ThemedText style={{ color: colors.error, fontWeight: '500' }}>
                  Delete Task
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <DateTimePicker
            value={dueDate || new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {/* Time Picker Modal */}
        {showTimePicker && (
          <DateTimePicker
            value={dueTime ? new Date(`2000-01-01T${dueTime}`) : new Date()}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        )}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    marginLeft: 'auto',
  },
  tagsInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
  },
  addTagButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsContainer: {
    gap: 12,
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
});
