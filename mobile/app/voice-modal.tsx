import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
// eslint-disable-next-line import/no-unresolved
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

// eslint-disable-next-line import/no-unresolved
import { api } from '../convex/_generated/api';
// eslint-disable-next-line import/no-unresolved
import { Id } from '../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

type ModalMode = 'view' | 'record';

interface Recording {
  sound: Audio.Sound | null;
  duration: number;
  recording: Audio.Recording | null;
}

export default function VoiceModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ voiceNoteId?: string; mode?: ModalMode }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const mode = (params.mode as ModalMode) || (params.voiceNoteId ? 'view' : 'record');
  const voiceNoteId = params.voiceNoteId as Id<'voiceNotes'> | undefined;

  const [recording, setRecording] = useState<Recording>({
    sound: null,
    duration: 0,
    recording: null,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackListener = useRef<{ remove: () => void } | null>(null);

  const voiceNote = useQuery(
    voiceNoteId ? api.voiceNotes.get : 'skip',
    voiceNoteId ? { id: voiceNoteId } : 'skip'
  );
  const audioUrl = useQuery(
    voiceNoteId ? api.voiceNotes.getAudioUrl : 'skip',
    voiceNoteId ? { id: voiceNoteId } : 'skip'
  );
  const createVoiceNote = useMutation(api.voiceNotes.create);
  const deleteVoiceNote = useMutation(api.voiceNotes.remove);
  const updateVoiceNote = useMutation(api.voiceNotes.update);

  useEffect(() => {
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      if (recording.sound) {
        recording.sound.unloadAsync();
      }
      if (recording.recording) {
        recording.recording.stopAndUnloadAsync().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (voiceNote && mode === 'view') {
      setTitle(voiceNote.title || '');
      setTags(voiceNote.tags);
      if (audioUrl) {
        setAudioUri(audioUrl);
      }
    }
  }, [voiceNote, mode, audioUrl]);

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording({
        sound: null,
        duration: 0,
        recording: newRecording,
      });
      setIsRecording(true);
      setElapsedTime(0);

      recordingInterval.current = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }

      if (recording.recording) {
        await recording.recording.stopAndUnloadAsync();
        const uri = recording.recording.getUri();
        setAudioUri(uri);

        const { sound } = await Audio.Sound.createAsync({ uri });
        setRecording({
          sound,
          duration: elapsedTime,
          recording: null,
        });

        setIsRecording(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Error', 'Failed to stop recording');
      setIsRecording(false);
    }
  };

  const playRecording = async () => {
    try {
      if (recording.sound) {
        if (isPlaying) {
          await recording.sound.pauseAsync();
          setIsPlaying(false);
        } else {
          playbackListener.current = recording.sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.durationMillis && status.positionMillis >= status.durationMillis - 100) {
              setIsPlaying(false);
            }
          });
          await recording.sound.replayAsync();
          setIsPlaying(true);
        }
      } else if (audioUri) {
        if (recording.sound) {
          await recording.sound.unloadAsync();
        }
        const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
        setRecording((prev) => ({ ...prev, sound }));

        playbackListener.current = sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.durationMillis && status.positionMillis >= status.durationMillis - 100) {
            setIsPlaying(false);
          }
        });
        await sound.replayAsync();
        setIsPlaying(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to play audio');
    }
  };

  const discardRecording = async () => {
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }

    if (recording.recording) {
      await recording.recording.stopAndUnloadAsync().catch(() => {});
    }
    if (recording.sound) {
      await recording.sound.unloadAsync();
    }

    setRecording({ sound: null, duration: 0, recording: null });
    setAudioUri(null);
    setElapsedTime(0);
    Haptics.selectionAsync();
  };

  const handleSave = async () => {
    if (!audioUri && !recording.sound) {
      Alert.alert('Error', 'No recording to save');
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'record' && audioUri) {
        const response = await fetch(audioUri);
        const blob = await response.blob();

        const uploadUrl = await fetch(api.voiceNotes.generateUploadUrl).then((r) => r.text());

        await fetch(uploadUrl, {
          method: 'POST',
          body: blob,
          headers: {
            'Content-Type': 'audio/webm',
          },
        });

        await createVoiceNote({
          title: title.trim() || undefined,
          durationMs: recording.duration || elapsedTime,
          tags: tags.length > 0 ? tags : undefined,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else if (mode === 'view' && voiceNoteId) {
        await updateVoiceNote({
          id: voiceNoteId,
          title: title.trim() || undefined,
          tags,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch {
      Alert.alert('Error', 'Failed to save voice note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!voiceNoteId) return;

    Alert.alert('Delete Voice Note', 'Are you sure you want to delete this voice note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVoiceNote({ id: voiceNoteId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            Alert.alert('Error', 'Failed to delete voice note');
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

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const isLoading = mode === 'view' && voiceNote === undefined;

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={[styles.headerButton, { color: colors.textSecondary }]}>
            Cancel
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.headerTitle}>
          {mode === 'record' ? 'New Recording' : 'Voice Note'}
        </ThemedText>

        <TouchableOpacity onPress={handleSave} disabled={isSaving || (!audioUri && mode === 'record')}>
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <ThemedText style={[styles.headerButton, { color: colors.accent }]}>
              {mode === 'record' ? 'Save' : 'Done'}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.recordingContainer}>
          <View style={[styles.waveformContainer, { backgroundColor: colors.surface }]}>
            {isRecording ? (
              <View style={styles.recordingIndicator}>
                <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
                <ThemedText style={[styles.recordingText, { color: colors.error }]}>
                  Recording...
                </ThemedText>
              </View>
            ) : (
              <ThemedText style={[styles.duration, { color: colors.text }]}>
                {formatDuration(recording.duration || elapsedTime)}
              </ThemedText>
            )}
          </View>

          <View style={styles.controls}>
            {(audioUri || recording.sound) && !isRecording ? (
              <TouchableOpacity
                style={[styles.controlButton, { backgroundColor: colors.accent }]}
                onPress={playRecording}>
                <IconSymbol size={28} name={isPlaying ? 'pause.fill' : 'play.fill'} color="#fff" />
              </TouchableOpacity>
            ) : null}

            {mode === 'record' && (
              <TouchableOpacity
                style={[styles.controlButton, { backgroundColor: isRecording ? colors.error : colors.accent }]}
                onPress={isRecording ? stopRecording : startRecording}>
                <IconSymbol size={28} name={isRecording ? 'stop.fill' : 'mic.fill'} color="#fff" />
              </TouchableOpacity>
            )}

            {(audioUri || recording.sound) && !isRecording && mode === 'record' ? (
              <TouchableOpacity
                style={[styles.controlButton, { backgroundColor: colors.error }]}
                onPress={discardRecording}>
                <IconSymbol size={24} name="trash.fill" color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {mode === 'view' && voiceNote && (
          <View style={[styles.infoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                Created
              </ThemedText>
              <ThemedText style={[styles.infoValue, { color: colors.textSecondary }]}>
                {format(new Date(voiceNote.createdAt), 'MMM d, yyyy h:mm a')}
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: colors.textMuted }]}>
                Status
              </ThemedText>
              <ThemedText
                style={[
                  styles.infoValue,
                  {
                    color:
                      voiceNote.transcriptionStatus === 'completed'
                        ? colors.success
                        : voiceNote.transcriptionStatus === 'processing'
                        ? colors.warning
                        : colors.textMuted,
                  },
                ]}>
                {voiceNote.transcriptionStatus}
              </ThemedText>
            </View>
          </View>
        )}

        {voiceNote?.transcription && (
          <View style={styles.transcriptionContainer}>
            <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Transcription
            </ThemedText>
            <ThemedText style={[styles.transcription, { color: colors.text }]}>
              {voiceNote.transcription}
            </ThemedText>
          </View>
        )}

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
            placeholder="Voice note title..."
            placeholderTextColor={colors.textMuted}
          />
        </View>

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

        {mode === 'view' && voiceNote && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
              onPress={handleDelete}>
              <IconSymbol size={18} name="trash" color={colors.error} />
              <ThemedText style={{ color: colors.error, fontWeight: '500' }}>
                Delete Voice Note
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  recordingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  waveformContainer: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  recordingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  duration: {
    fontSize: 48,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
  transcriptionContainer: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  transcription: {
    fontSize: 15,
    lineHeight: 22,
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
