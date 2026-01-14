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

export default function NoteModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ noteId?: string; mode?: ModalMode }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const mode = (params.mode as ModalMode) || 'create';
  const noteId = params.noteId as Id<'notes'> | undefined;

  // State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Queries & Mutations
  const note = useQuery(api.notes.get, noteId ? { id: noteId } : 'skip');
  const noteSnapshot = useQuery(
    api.notesSync.getSnapshot,
    noteId ? { noteId } : 'skip'
  );
  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);
  const deleteNote = useMutation(api.notes.remove);
  const initializeDocument = useMutation(api.notesSync.initializeDocument);


  // Load existing note data
  useEffect(() => {
    if (note && mode === 'edit') {
      setTitle(note.title);
      setTags(note.tags);
    }
  }, [note, mode]);

  useEffect(() => {
    if (noteSnapshot && noteSnapshot.doc) {
      setContent(extractTextFromDoc(noteSnapshot.doc));
    }
  }, [noteSnapshot]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a note title');
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'create') {
        const createdId = await createNote({
          title: title.trim(),
          tags,
        });
        await initializeDocument({
          noteId: createdId,
          doc: buildDocFromText(content),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (mode === 'edit' && noteId) {
        await updateNote({
          id: noteId,
          title: title.trim(),
          tags,
        });
        await initializeDocument({
          noteId,
          doc: buildDocFromText(content),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!noteId) return;

    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote({ id: noteId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            Alert.alert('Error', 'Failed to delete note');
          }
        },
      },
    ]);
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

  const buildDocFromText = (text: string) => ({
    type: 'doc',
    content: text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
  });

  const extractTextFromDoc = (doc: unknown): string => {
    const texts: string[] = [];
    const traverse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'text' && typeof n.text === 'string') {
        texts.push(n.text);
      }
      if (Array.isArray(n.content)) {
        n.content.forEach(traverse);
      }
    };
    traverse(doc);
    return texts.join('\n');
  };

  const isLoading = mode === 'edit' && note === undefined;

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
            {mode === 'create' ? 'New Note' : 'Edit Note'}
          </ThemedText>

          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <ThemedText style={[styles.headerButton, { color: colors.accent }]}>
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
              placeholder="Note title..."
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Content - Simple text editor for mobile */}
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
              Content
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
              value={content}
              onChangeText={setContent}
              placeholder="Write your note here..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
            <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
              Note: For rich text editing, use the web app. Mobile supports plain text.
            </ThemedText>
          </View>

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
                style={[styles.addTagButton, { backgroundColor: colors.accent }]}
                onPress={handleAddTag}>
                <IconSymbol size={18} name="plus" color="#fff" />
              </TouchableOpacity>
            </View>

            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tag, { backgroundColor: colors.accent + '20' }]}
                    onPress={() => handleRemoveTag(tag)}>
                    <ThemedText style={[styles.tagText, { color: colors.accent }]}>
                      #{tag}
                    </ThemedText>
                    <IconSymbol size={12} name="xmark" color={colors.accent} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Note Info for Edit Mode */}
          {mode === 'edit' && note && (
            <View style={[styles.infoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.infoRow}>
                <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                  Created
                </ThemedText>
                <ThemedText style={[styles.infoValue, { color: colors.textSecondary }]}>
                  {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                </ThemedText>
              </View>
              <View style={styles.infoRow}>
                <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                  Updated
                </ThemedText>
                <ThemedText style={[styles.infoValue, { color: colors.textSecondary }]}>
                  {format(new Date(note.updatedAt), 'MMM d, yyyy h:mm a')}
                </ThemedText>
              </View>
            </View>
          )}

          {/* Actions for Edit Mode */}
          {mode === 'edit' && note && (
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                onPress={handleDelete}>
                <IconSymbol size={18} name="trash" color={colors.error} />
                <ThemedText style={{ color: colors.error, fontWeight: '500' }}>
                  Delete Note
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
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
    minHeight: 200,
    paddingTop: 12,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
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
  infoContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsContainer: {
    gap: 12,
    marginTop: 8,
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
