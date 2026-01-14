import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useMutation, useAction } from 'convex/react';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface FileItem {
  _id: Id<'files'>;
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveWebViewLink?: string;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  sourceType: 'upload' | 'youtube' | 'webpage' | 'github';
  createdAt: number;
}

const sourceTypeLabels: Record<FileItem['sourceType'], string> = {
  upload: 'Upload',
  youtube: 'YouTube',
  webpage: 'Web',
  github: 'GitHub',
};

export default function FilesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const [showAddModal, setShowAddModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingLink, setIsAddingLink] = useState(false);

  const files = useQuery(api.files.list, { limit: 50 }) as FileItem[] | undefined;
  const uploadFile = useAction(api.files.uploadFile);
  const createFromUrl = useMutation(api.files.createFromUrl);
  const removeFile = useMutation(api.files.remove);

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.uri) return;

    setIsUploading(true);
    try {
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const fileData = Array.from(new Uint8Array(buffer));

      await uploadFile({
        fileName: asset.name ?? 'upload',
        mimeType: asset.mimeType ?? 'application/octet-stream',
        fileData,
        tags: [],
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddLink = async () => {
    if (!linkInput.trim()) return;

    setIsAddingLink(true);
    try {
      await createFromUrl({ url: linkInput.trim(), tags: [] });
      setLinkInput('');
      setShowAddModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to add link:', error);
    } finally {
      setIsAddingLink(false);
    }
  };

  const handleOpenFile = (file: FileItem) => {
    if (file.driveWebViewLink) {
      Linking.openURL(file.driveWebViewLink);
    }
  };

  const handleDelete = async (fileId: Id<'files'>) => {
    try {
      await removeFile({ id: fileId });
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const renderFile = ({ item }: { item: FileItem }) => (
    <View style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
      <TouchableOpacity style={styles.fileInfo} onPress={() => handleOpenFile(item)}>
        <View style={[styles.fileIcon, { backgroundColor: colors.accent + '20' }]}
          >
          <IconSymbol size={18} name="doc.fill" color={colors.accent} />
        </View>
        <View style={styles.fileMeta}>
          <ThemedText style={styles.fileName} numberOfLines={1}>
            {item.fileName}
          </ThemedText>
          <ThemedText style={[styles.fileSubtitle, { color: colors.textMuted }]}
            >
            {sourceTypeLabels[item.sourceType]} • {item.extractionStatus}
          </ThemedText>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDelete(item._id)}>
        <IconSymbol size={16} name="trash" color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Files</ThemedText>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.accent }]}
            onPress={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol size={18} name="arrow.up.doc" color="#fff" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddModal(true)}
          >
            <IconSymbol size={18} name="link" color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={files ?? []}
        keyExtractor={(item) => item._id}
        renderItem={renderFile}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol size={48} name="folder" color={colors.textMuted} />
            <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}
              >
              No files yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}
              >
              Upload a file or add a link to get started
            </ThemedText>
          </View>
        }
      />

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
            <ThemedText style={styles.modalTitle}>Add Link</ThemedText>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="https://..."
              placeholderTextColor={colors.textMuted}
              value={linkInput}
              onChangeText={setLinkInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <ThemedText style={[styles.modalButton, { color: colors.textSecondary }]}
                  >
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddLink} disabled={isAddingLink}>
                <ThemedText style={[styles.modalButton, { color: colors.primary }]}
                  >
                  {isAddingLink ? 'Adding...' : 'Add'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  fileCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  modalButton: {
    fontSize: 14,
    fontWeight: '600',
  },
});
