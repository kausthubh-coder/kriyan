import React, { useState, useCallback } from 'react';
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

interface Note {
  _id: Id<'notes'>;
  _creationTime: number;
  title: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function NoteCard({
  note,
  onPress,
  colors,
}: {
  note: Note;
  onPress: () => void;
  colors: typeof Colors.dark;
}) {
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

  return (
    <TouchableOpacity
      style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.noteContent}>
        <View style={styles.noteHeader}>
          <View style={[styles.noteIcon, { backgroundColor: colors.accent + '20' }]}>
            <IconSymbol size={16} name="doc.text" color={colors.accent} />
          </View>
          <ThemedText style={styles.noteTitle} numberOfLines={1}>
            {note.title || 'Untitled Note'}
          </ThemedText>
        </View>

        <View style={styles.noteMeta}>
          <View style={styles.metaItem}>
            <IconSymbol size={12} name="clock" color={colors.textMuted} />
            <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
              {formatDate(note.updatedAt)}
            </ThemedText>
          </View>

          {note.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {note.tags.slice(0, 2).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                  <ThemedText style={[styles.tagText, { color: colors.primary }]}>
                    #{tag}
                  </ThemedText>
                </View>
              ))}
              {note.tags.length > 2 && (
                <ThemedText style={[styles.moreTagsText, { color: colors.textMuted }]}>
                  +{note.tags.length - 2}
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

export default function NotesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Queries
  const allNotes = useQuery(api.notes.list, { limit: 50 });
  const searchResults = useQuery(
    api.notes.search,
    searchQuery.trim() ? { query: searchQuery } : 'skip'
  );

  const notes = searchQuery.trim() ? searchResults : allNotes;
  const isLoading = notes === undefined;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Queries auto-refresh, we just need a small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const handleNotePress = (note: Note) => {
    Haptics.selectionAsync();
    router.push({
      pathname: '/note-modal',
      params: { noteId: note._id, mode: 'edit' },
    });
  };

  const handleCreateNote = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/note-modal',
      params: { mode: 'create' },
    });
  };

  const renderNote = ({ item }: { item: Note }) => (
    <NoteCard
      note={item}
      onPress={() => handleNotePress(item)}
      colors={colors}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol size={48} name="doc.text" color={colors.textMuted} />
      <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        {searchQuery ? 'No notes found' : 'No notes yet'}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        {searchQuery
          ? 'Try a different search term'
          : 'Tap the + button to create your first note'}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Search Bar */}
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
            placeholder="Search notes..."
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol size={16} name="xmark.circle.fill" color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notes List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notes ?? []}
          renderItem={renderNote}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            (notes?.length ?? 0) === 0 && styles.emptyListContent,
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
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={handleCreateNote}
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  noteContent: {
    flex: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  noteIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginLeft: 42,
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
