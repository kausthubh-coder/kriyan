import React, { useState } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { format, formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface VoiceNote {
  _id: Id<'voiceNotes'>;
  _creationTime: number;
  title?: string;
  durationMs?: number;
  transcription?: string;
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  tags: string[];
  createdAt: number;
}

function VoiceNoteCard({
  voiceNote,
  onPress,
  colors,
}: {
  voiceNote: VoiceNote;
  onPress: () => void;
  colors: typeof Colors.dark;
}) {
  const formatDuration = (ms?: number) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
      return formatDistanceToNow(date, { addSuffix: true });
    } else if (diffDays < 7) {
      return format(date, 'EEEE');
    }
    return format(date, 'MMM d');
  };

  const getStatusColor = () => {
    switch (voiceNote.transcriptionStatus) {
      case 'completed':
        return colors.success;
      case 'processing':
        return colors.warning;
      case 'failed':
        return colors.error;
      default:
        return colors.textMuted;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.voiceNoteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.voiceNoteContent}>
        <View style={styles.voiceNoteHeader}>
          <View style={[styles.voiceNoteIcon, { backgroundColor: colors.accent + '20' }]}>
            <IconSymbol size={16} name="mic.fill" color={colors.accent} />
          </View>
          <ThemedText style={styles.voiceNoteTitle} numberOfLines={1}>
            {voiceNote.title || 'Untitled Voice Note'}
          </ThemedText>
        </View>

        <View style={styles.voiceNoteMeta}>
          <View style={styles.metaItem}>
            <IconSymbol size={12} name="clock" color={colors.textMuted} />
            <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
              {formatDate(voiceNote.createdAt)}
            </ThemedText>
          </View>
          {voiceNote.durationMs && (
            <View style={styles.metaItem}>
              <IconSymbol size={12} name="timer" color={colors.textMuted} />
              <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
                {formatDuration(voiceNote.durationMs)}
              </ThemedText>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>
              {voiceNote.transcriptionStatus}
            </ThemedText>
          </View>
        </View>

        {voiceNote.transcription && (
          <ThemedText style={[styles.transcriptionPreview, { color: colors.textSecondary }]} numberOfLines={2}>
            {voiceNote.transcription}
          </ThemedText>
        )}

        {voiceNote.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {voiceNote.tags.slice(0, 2).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                <ThemedText style={[styles.tagText, { color: colors.primary }]}>
                  #{tag}
                </ThemedText>
              </View>
            ))}
            {voiceNote.tags.length > 2 && (
              <ThemedText style={[styles.moreTagsText, { color: colors.textMuted }]}>
                +{voiceNote.tags.length - 2}
              </ThemedText>
            )}
          </View>
        )}
      </View>

      <IconSymbol size={16} name="chevron.right" color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function VoiceScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const allVoiceNotes = useQuery(api.voiceNotes.list, { limit: 50 });
  const searchResults = useQuery(
    api.voiceNotes.search,
    searchQuery.trim() ? { query: searchQuery } : 'skip'
  );

  const voiceNotes = searchQuery.trim() ? searchResults : allVoiceNotes;
  const isLoading = voiceNotes === undefined;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const handleVoiceNotePress = (voiceNote: VoiceNote) => {
    Haptics.selectionAsync();
    router.push({
      pathname: '/voice-modal',
      params: { voiceNoteId: voiceNote._id },
    });
  };

  const handleRecord = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/voice-modal',
      params: { mode: 'record' },
    });
  };

  const renderVoiceNote = ({ item }: { item: VoiceNote }) => (
    <VoiceNoteCard
      voiceNote={item}
      onPress={() => handleVoiceNotePress(item)}
      colors={colors}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol size={48} name="mic.fill" color={colors.textMuted} />
      <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        {searchQuery ? 'No voice notes found' : 'No voice notes yet'}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        {searchQuery
          ? 'Try a different search term'
          : 'Tap the + button to record your first voice note'}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Voice Notes</ThemedText>
        <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {voiceNotes?.length ?? 0} recordings
        </ThemedText>
      </View>

      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchInputWrapper,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <IconSymbol size={18} name="magnifyingglass" color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search voice notes..."
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol size={16} name="xmark.circle.fill" color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={voiceNotes ?? []}
          renderItem={renderVoiceNote}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            (voiceNotes?.length ?? 0) === 0 && styles.emptyListContent,
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

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={handleRecord}
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
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
  voiceNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  voiceNoteContent: {
    flex: 1,
  },
  voiceNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  voiceNoteIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceNoteTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  voiceNoteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginLeft: 42,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  transcriptionPreview: {
    fontSize: 13,
    marginLeft: 42,
    marginBottom: 8,
    lineHeight: 18,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 42,
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
