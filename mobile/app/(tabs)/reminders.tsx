import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, DesignColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface Reminder {
  _id: Id<'reminders'>;
  _creationTime: number;
  title: string;
  taskId?: Id<'tasks'>;
  noteId?: Id<'notes'>;
  triggerAt: number;
  isRecurring: boolean;
  recurrenceRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
    interval: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    monthOfYear?: number;
    endDate?: number;
  };
  isAlarm: boolean;
  notified: boolean;
  snoozedUntil?: number;
  scheduledFunctionId?: Id<'_scheduled_functions'>;
  localNotificationId?: string;
  createdAt: number;
}

type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'none';

function ReminderCard({
  reminder,
  onSnooze,
  onDismiss,
  onDelete,
  colors,
}: {
  reminder: Reminder;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
  onDelete: () => void;
  colors: typeof Colors.dark;
}) {
  const isOverdue = isPast(new Date(reminder.triggerAt)) && !reminder.notified;
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const formatTriggerTime = (timestamp: number) => {
    const date = new Date(timestamp);
    if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
    if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`;
    return format(date, "MMM d 'at' h:mm a");
  };

  const getRecurrenceText = () => {
    if (!reminder.isRecurring || !reminder.recurrenceRule) return null;
    const { frequency, interval } = reminder.recurrenceRule;
    const prefix = interval === 1 ? '' : `Every ${interval} `;
    switch (frequency) {
      case 'daily':
        return interval === 1 ? 'Daily' : `${prefix}days`;
      case 'weekly':
        return interval === 1 ? 'Weekly' : `${prefix}weeks`;
      case 'monthly':
        return interval === 1 ? 'Monthly' : `${prefix}months`;
      case 'yearly':
        return interval === 1 ? 'Yearly' : `${prefix}years`;
      default:
        return null;
    }
  };

  const snoozeOptions = [
    { label: '5 min', minutes: 5 },
    { label: '15 min', minutes: 15 },
    { label: '1 hour', minutes: 60 },
    { label: 'Tomorrow', minutes: 24 * 60 },
  ];

  return (
    <View
      style={[
        styles.reminderCard,
        {
          backgroundColor: colors.surface,
          borderColor: isOverdue ? colors.error : colors.border,
          borderWidth: isOverdue ? 2 : 1,
        },
      ]}>
      <View style={styles.reminderContent}>
        <View style={styles.reminderHeader}>
          <View
            style={[
              styles.reminderIcon,
              { backgroundColor: reminder.isAlarm ? colors.warning + '20' : colors.primary + '20' },
            ]}>
            <IconSymbol
              size={18}
              name={reminder.isAlarm ? 'alarm' : 'bell.fill'}
              color={reminder.isAlarm ? colors.warning : colors.primary}
            />
          </View>
          <View style={styles.reminderInfo}>
            <ThemedText style={styles.reminderTitle}>{reminder.title}</ThemedText>
            <ThemedText
              style={[
                styles.reminderTime,
                { color: isOverdue ? colors.error : colors.textSecondary },
              ]}>
              {isOverdue ? `${formatDistanceToNow(new Date(reminder.triggerAt))} ago` : formatTriggerTime(reminder.triggerAt)}
            </ThemedText>
            {getRecurrenceText() && (
              <View style={[styles.recurrenceBadge, { backgroundColor: colors.accent + '20' }]}>
                <IconSymbol size={10} name="repeat" color={colors.accent} />
                <ThemedText style={[styles.recurrenceText, { color: colors.accent }]}>
                  {getRecurrenceText()}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.reminderActions}>
          {!reminder.notified && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowSnoozeMenu(!showSnoozeMenu);
                }}>
                <IconSymbol size={14} name="clock.arrow.circlepath" color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.success + '20' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDismiss();
                }}>
                <IconSymbol size={14} name="checkmark" color={colors.success} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDelete();
            }}>
            <IconSymbol size={14} name="trash" color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {showSnoozeMenu && (
        <View style={[styles.snoozeMenu, { borderTopColor: colors.border }]}>
          {snoozeOptions.map((option) => (
            <TouchableOpacity
              key={option.minutes}
              style={[styles.snoozeOption, { backgroundColor: colors.surface }]}
              onPress={() => {
                Haptics.selectionAsync();
                onSnooze(option.minutes);
                setShowSnoozeMenu(false);
              }}>
              <ThemedText style={[styles.snoozeOptionText, { color: colors.textSecondary }]}>
                {option.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function RemindersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [triggerDate, setTriggerDate] = useState(new Date());
  const [triggerTime, setTriggerTime] = useState(new Date());
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('none');
  const [isAlarm, setIsAlarm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Queries & Mutations
  const reminders = useQuery(api.reminders.list, { includeNotified: false });
  const createReminder = useMutation(api.reminders.create);
  const snoozeReminder = useMutation(api.reminders.snooze);
  const dismissReminder = useMutation(api.reminders.dismiss);
  const deleteReminder = useMutation(api.reminders.remove);

  const isLoading = reminders === undefined;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const handleSnooze = async (reminderId: Id<'reminders'>, minutes: number) => {
    try {
      await snoozeReminder({ id: reminderId, durationMinutes: minutes });
    } catch {
      Alert.alert('Error', 'Failed to snooze reminder');
    }
  };

  const handleDismiss = async (reminderId: Id<'reminders'>) => {
    try {
      await dismissReminder({ id: reminderId });
    } catch {
      Alert.alert('Error', 'Failed to dismiss reminder');
    }
  };

  const handleDelete = (reminderId: Id<'reminders'>) => {
    Alert.alert('Delete Reminder', 'Are you sure you want to delete this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReminder({ id: reminderId });
          } catch {
            Alert.alert('Error', 'Failed to delete reminder');
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setTitle('');
    setTriggerDate(new Date());
    setTriggerTime(new Date());
    setIsRecurring(false);
    setFrequency('none');
    setIsAlarm(false);
  };

  const scheduleLocalNotification = async (reminder: { title: string; triggerAt: number; id: string }) => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert('Permission required', 'Please enable notifications to receive reminders');
          return null;
        }
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Reminder',
          body: reminder.title,
          data: { reminderId: reminder.id },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.triggerAt),
        },
      });

      return notificationId;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  };

  const handleCreateReminder = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a reminder title');
      return;
    }

    setIsSaving(true);
    try {
      // Combine date and time
      const trigger = new Date(triggerDate);
      trigger.setHours(triggerTime.getHours(), triggerTime.getMinutes(), 0, 0);

      if (trigger <= new Date()) {
        Alert.alert('Error', 'Please select a future date and time');
        setIsSaving(false);
        return;
      }

      const recurrenceRule =
        isRecurring && frequency !== 'none'
          ? {
              frequency: frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
              interval: 1,
            }
          : undefined;

      const reminderId = await createReminder({
        title: title.trim(),
        triggerAt: trigger.getTime(),
        isRecurring: isRecurring && frequency !== 'none',
        recurrenceRule,
        isAlarm,
      });

      // Schedule local notification
      await scheduleLocalNotification({
        title: title.trim(),
        triggerAt: trigger.getTime(),
        id: reminderId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      Alert.alert('Error', 'Failed to create reminder');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCreateModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetForm();
    setShowCreateModal(true);
  };

  const renderReminder = ({ item }: { item: Reminder }) => (
    <ReminderCard
      reminder={item}
      onSnooze={(minutes) => handleSnooze(item._id, minutes)}
      onDismiss={() => handleDismiss(item._id)}
      onDelete={() => handleDelete(item._id)}
      colors={colors}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol size={48} name="bell.slash" color={colors.textMuted} />
      <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        No reminders
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        Tap the + button to create a reminder
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={reminders}
          renderItem={renderReminder}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            reminders?.length === 0 && styles.emptyListContent,
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
        onPress={handleOpenCreateModal}
        activeOpacity={0.8}>
        <IconSymbol size={24} name="plus" color="#fff" />
      </TouchableOpacity>

      {/* Create Reminder Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ThemedView style={styles.modalContent}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <ThemedText style={[styles.headerButton, { color: colors.textSecondary }]}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>New Reminder</ThemedText>
              <TouchableOpacity onPress={handleCreateReminder} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <ThemedText style={[styles.headerButton, { color: colors.primary }]}>
                    Save
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
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
                  placeholder="What do you want to remember?"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {/* Date */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Date</ThemedText>
                <TouchableOpacity
                  style={[
                    styles.input,
                    styles.dateInput,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => setShowDatePicker(true)}>
                  <IconSymbol size={18} name="calendar" color={colors.textSecondary} />
                  <ThemedText>{format(triggerDate, 'EEEE, MMMM d, yyyy')}</ThemedText>
                </TouchableOpacity>
              </View>

              {/* Time */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Time</ThemedText>
                <TouchableOpacity
                  style={[
                    styles.input,
                    styles.dateInput,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => setShowTimePicker(true)}>
                  <IconSymbol size={18} name="clock" color={colors.textSecondary} />
                  <ThemedText>{format(triggerTime, 'h:mm a')}</ThemedText>
                </TouchableOpacity>
              </View>

              {/* Repeat */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Repeat</ThemedText>
                <View style={styles.frequencyOptions}>
                  {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as RecurrenceFrequency[]).map(
                    (freq) => (
                      <TouchableOpacity
                        key={freq}
                        style={[
                          styles.frequencyChip,
                          {
                            backgroundColor: frequency === freq ? colors.primary : colors.surface,
                            borderColor: frequency === freq ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setFrequency(freq);
                          setIsRecurring(freq !== 'none');
                        }}>
                        <ThemedText
                          style={[
                            styles.frequencyChipText,
                            { color: frequency === freq ? '#fff' : colors.textSecondary },
                          ]}>
                          {freq === 'none' ? 'Never' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </ThemedText>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>

              {/* Alarm Toggle */}
              <TouchableOpacity
                style={[
                  styles.toggleRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsAlarm(!isAlarm);
                }}>
                <View style={styles.toggleInfo}>
                  <IconSymbol
                    size={20}
                    name="alarm"
                    color={isAlarm ? colors.warning : colors.textSecondary}
                  />
                  <View>
                    <ThemedText style={styles.toggleLabel}>High Priority Alarm</ThemedText>
                    <ThemedText style={[styles.toggleDescription, { color: colors.textMuted }]}>
                      More prominent notification
                    </ThemedText>
                  </View>
                </View>
                <View
                  style={[
                    styles.toggle,
                    { backgroundColor: isAlarm ? colors.warning : colors.textMuted },
                  ]}>
                  <View
                    style={[
                      styles.toggleThumb,
                      { transform: [{ translateX: isAlarm ? 20 : 0 }] },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* Date Picker */}
            {showDatePicker && (
              <DateTimePicker
                value={triggerDate}
                mode="date"
                display="default"
                onChange={(_e, date) => {
                  setShowDatePicker(false);
                  if (date) setTriggerDate(date);
                }}
                minimumDate={new Date()}
              />
            )}

            {/* Time Picker */}
            {showTimePicker && (
              <DateTimePicker
                value={triggerTime}
                mode="time"
                display="default"
                onChange={(_e, time) => {
                  setShowTimePicker(false);
                  if (time) setTriggerTime(time);
                }}
              />
            )}
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  reminderCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 12,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderInfo: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  reminderTime: {
    fontSize: 13,
  },
  recurrenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  recurrenceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reminderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snoozeMenu: {
    flexDirection: 'row',
    borderTopWidth: 1,
    padding: 8,
    gap: 8,
  },
  snoozeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  snoozeOptionText: {
    fontSize: 12,
    fontWeight: '500',
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
  modalContainer: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  formContent: {
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
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  frequencyOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  frequencyChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 4,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
});
