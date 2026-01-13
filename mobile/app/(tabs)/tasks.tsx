import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import * as Haptics from 'expo-haptics';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, DesignColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

type TaskStatus = 'pending' | 'completed' | 'archived';
type FilterType = 'all' | 'today' | 'upcoming' | 'overdue';

interface Task {
  _id: Id<'tasks'>;
  _creationTime: number;
  title: string;
  description?: string;
  status: TaskStatus;
  tags: string[];
  dueDate?: number;
  dueTime?: string;
  parentTaskId?: Id<'tasks'>;
  googleCalendarEventId?: string;
  createdAt: number;
  updatedAt: number;
}

function TaskCard({
  task,
  onComplete,
  onPress,
  colors,
}: {
  task: Task;
  onComplete: () => void;
  onPress: () => void;
  colors: typeof Colors.dark;
}) {
  const isCompleted = task.status === 'completed';
  const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isCompleted;

  const formatDueDate = (timestamp: number) => {
    const date = new Date(timestamp);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  return (
    <TouchableOpacity
      style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <TouchableOpacity
        style={[
          styles.checkbox,
          {
            borderColor: isCompleted ? colors.success : colors.border,
            backgroundColor: isCompleted ? colors.success : 'transparent',
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onComplete();
        }}>
        {isCompleted && <IconSymbol size={14} name="checkmark" color="#fff" />}
      </TouchableOpacity>

      <View style={styles.taskContent}>
        <ThemedText
          style={[
            styles.taskTitle,
            isCompleted && { textDecorationLine: 'line-through', color: colors.textMuted },
          ]}>
          {task.title}
        </ThemedText>

        <View style={styles.taskMeta}>
          {task.dueDate && (
            <View style={styles.metaItem}>
              <IconSymbol
                size={12}
                name="calendar"
                color={isOverdue ? colors.error : colors.textSecondary}
              />
              <ThemedText
                style={[
                  styles.metaText,
                  { color: isOverdue ? colors.error : colors.textSecondary },
                ]}>
                {formatDueDate(task.dueDate)}
                {task.dueTime && ` ${task.dueTime}`}
              </ThemedText>
            </View>
          )}

          {task.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {task.tags.slice(0, 2).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                  <ThemedText style={[styles.tagText, { color: colors.primary }]}>
                    #{tag}
                  </ThemedText>
                </View>
              ))}
              {task.tags.length > 2 && (
                <ThemedText style={[styles.moreTagsText, { color: colors.textMuted }]}>
                  +{task.tags.length - 2}
                </ThemedText>
              )}
            </View>
          )}
        </View>
      </View>

      <IconSymbol size={16} name="chevron.right" color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: typeof Colors.dark;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      <ThemedText
        style={[styles.filterChipText, { color: active ? '#fff' : colors.textSecondary }]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

export default function TasksScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();

  const [filter, setFilter] = useState<FilterType>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Queries based on filter
  const allTasks = useQuery(api.tasks.list, { status: showCompleted ? undefined : 'pending' });
  const todayTasks = useQuery(api.tasks.listToday, {});
  const upcomingTasks = useQuery(api.tasks.listUpcoming, { days: 7 });
  const overdueTasks = useQuery(api.tasks.listOverdue, {});

  const complete = useMutation(api.tasks.complete);
  const uncomplete = useMutation(api.tasks.uncomplete);

  const getTasks = useCallback((): Task[] => {
    switch (filter) {
      case 'today':
        return todayTasks ?? [];
      case 'upcoming':
        return upcomingTasks ?? [];
      case 'overdue':
        return overdueTasks ?? [];
      default:
        return allTasks ?? [];
    }
  }, [filter, allTasks, todayTasks, upcomingTasks, overdueTasks]);

  const tasks = getTasks();
  const isLoading =
    (filter === 'all' && allTasks === undefined) ||
    (filter === 'today' && todayTasks === undefined) ||
    (filter === 'upcoming' && upcomingTasks === undefined) ||
    (filter === 'overdue' && overdueTasks === undefined);

  const handleComplete = async (task: Task) => {
    try {
      if (task.status === 'completed') {
        await uncomplete({ id: task._id });
      } else {
        await complete({ id: task._id });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Queries auto-refresh, we just need a small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const handleTaskPress = (task: Task) => {
    router.push({
      pathname: '/modal',
      params: { taskId: task._id, mode: 'edit' },
    });
  };

  const handleCreateTask = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/modal',
      params: { mode: 'create' },
    });
  };

  const renderTask = ({ item }: { item: Task }) => (
    <TaskCard
      task={item}
      onComplete={() => handleComplete(item)}
      onPress={() => handleTaskPress(item)}
      colors={colors}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol size={48} name="checkmark.circle" color={colors.textMuted} />
      <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        {filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        Tap the + button to create your first task
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Filters */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: 'all', label: 'All' },
            { key: 'today', label: 'Today' },
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'overdue', label: 'Overdue' },
          ]}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              active={filter === item.key}
              onPress={() => setFilter(item.key as FilterType)}
              colors={colors}
            />
          )}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* Task List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderTask}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            tasks.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={handleCreateTask}
        activeOpacity={0.8}>
        <IconSymbol size={24} name="plus" color="#fff" />
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersContainer: {
    paddingVertical: 12,
  },
  filtersContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 11,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
