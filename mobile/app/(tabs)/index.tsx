import React from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';

import { api } from '../../../convex/_generated/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, DesignColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface StatCardProps {
  icon: string;
  iconColor: string;
  title: string;
  value: number | string;
  onPress?: () => void;
  colors: typeof Colors.dark;
}

function StatCard({ icon, iconColor, title, value, onPress, colors }: StatCardProps) {
  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}>
      <View style={[styles.statIcon, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol size={20} name={icon as any} color={iconColor} />
      </View>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</ThemedText>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();

  // Queries
  const pendingTasks = useQuery(api.tasks.list, { status: 'pending' });
  const todayTasks = useQuery(api.tasks.listToday, {});
  const overdueTasks = useQuery(api.tasks.listOverdue, {});
  const upcomingReminders = useQuery(api.reminders.listUpcoming, { days: 7 });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const navigateToTasks = () => {
    Haptics.selectionAsync();
    router.push('/(tabs)/tasks');
  };

  const navigateToReminders = () => {
    Haptics.selectionAsync();
    router.push('/(tabs)/reminders');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.greeting}>{greeting()}</ThemedText>
          <ThemedText style={[styles.date, { color: colors.textSecondary }]}>
            {format(new Date(), 'EEEE, MMMM d')}
          </ThemedText>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="checkmark.circle"
            iconColor={colors.primary}
            title="Pending Tasks"
            value={pendingTasks?.length ?? 0}
            onPress={navigateToTasks}
            colors={colors}
          />
          <StatCard
            icon="sun.max"
            iconColor={colors.warning}
            title="Due Today"
            value={todayTasks?.length ?? 0}
            onPress={navigateToTasks}
            colors={colors}
          />
          <StatCard
            icon="exclamationmark.triangle"
            iconColor={colors.error}
            title="Overdue"
            value={overdueTasks?.length ?? 0}
            onPress={navigateToTasks}
            colors={colors}
          />
          <StatCard
            icon="bell"
            iconColor={colors.accent}
            title="Reminders"
            value={upcomingReminders?.length ?? 0}
            onPress={navigateToReminders}
            colors={colors}
          />
        </View>

        {/* Today's Tasks Section */}
        {todayTasks && todayTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Due Today</ThemedText>
              <TouchableOpacity onPress={navigateToTasks}>
                <ThemedText style={[styles.seeAll, { color: colors.primary }]}>See all</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.tasksList}>
              {todayTasks.slice(0, 3).map((task) => (
                <TouchableOpacity
                  key={task._id}
                  style={[styles.taskItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({
                      pathname: '/modal',
                      params: { taskId: task._id, mode: 'edit' },
                    });
                  }}>
                  <View
                    style={[
                      styles.taskPriority,
                      { backgroundColor: task.status === 'completed' ? colors.success : colors.primary },
                    ]}
                  />
                  <View style={styles.taskContent}>
                    <ThemedText
                      style={[
                        styles.taskTitle,
                        task.status === 'completed' && styles.taskCompleted,
                      ]}
                      numberOfLines={1}>
                      {task.title}
                    </ThemedText>
                    {task.dueTime && (
                      <ThemedText style={[styles.taskTime, { color: colors.textMuted }]}>
                        {task.dueTime}
                      </ThemedText>
                    )}
                  </View>
                  <IconSymbol size={16} name="chevron.right" color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Upcoming Reminders Section */}
        {upcomingReminders && upcomingReminders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Upcoming Reminders</ThemedText>
              <TouchableOpacity onPress={navigateToReminders}>
                <ThemedText style={[styles.seeAll, { color: colors.primary }]}>See all</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.remindersList}>
              {upcomingReminders.slice(0, 3).map((reminder) => (
                <View
                  key={reminder._id}
                  style={[styles.reminderItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View
                    style={[
                      styles.reminderIcon,
                      {
                        backgroundColor: reminder.isAlarm
                          ? colors.warning + '20'
                          : colors.accent + '20',
                      },
                    ]}>
                    <IconSymbol
                      size={14}
                      name={reminder.isAlarm ? 'alarm' : 'bell.fill'}
                      color={reminder.isAlarm ? colors.warning : colors.accent}
                    />
                  </View>
                  <View style={styles.reminderContent}>
                    <ThemedText style={styles.reminderTitle} numberOfLines={1}>
                      {reminder.title}
                    </ThemedText>
                    <ThemedText style={[styles.reminderTime, { color: colors.textMuted }]}>
                      {format(new Date(reminder.triggerAt), "MMM d 'at' h:mm a")}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty State */}
        {(!pendingTasks || pendingTasks.length === 0) &&
          (!upcomingReminders || upcomingReminders.length === 0) && (
            <View style={styles.emptyState}>
              <IconSymbol size={48} name="sparkles" color={colors.textMuted} />
              <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                You're all caught up!
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Create tasks or reminders to get started
              </ThemedText>
            </View>
          )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
  },
  date: {
    fontSize: 15,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 13,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  taskPriority: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
    minHeight: 24,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  taskTime: {
    fontSize: 12,
    marginTop: 2,
  },
  remindersList: {
    gap: 8,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  reminderIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reminderContent: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  reminderTime: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
