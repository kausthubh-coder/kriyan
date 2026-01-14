import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useAction, useMutation, useQuery } from 'convex/react'
import * as Haptics from 'expo-haptics'
import { formatDistanceToNow } from 'date-fns'

import { api } from '../../../convex/_generated/api'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { IconSymbol } from '@/components/ui/icon-symbol'

interface Thread {
  _id: string
  title?: string
  createdAt: number
  updatedAt: number
}

interface Message {
  _id: string
  role: string
  content?: string
  createdAt: number
}

export default function ChatScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'dark']

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  const messagesRef = useRef<FlatList<Message>>(null)

  const threads = useQuery(api.agentThreads.listThreads, { limit: 50 }) as Thread[] | undefined
  const messages = useQuery(
    api.agentThreads.getThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId, limit: 100 } : 'skip'
  ) as Message[] | undefined

  const startConversation = useAction(api.agent.startConversation)
  const sendMessage = useAction(api.agent.sendMessage)
  const createThread = useMutation(api.agentThreads.createThread)
  const deleteThread = useMutation(api.agentThreads.deleteThread)

  useEffect(() => {
    if (!messagesRef.current || !messages || messages.length === 0) return
    messagesRef.current.scrollToEnd({ animated: true })
  }, [messages])

  const sortedThreads = useMemo(() => {
    if (!threads) return []
    return [...threads].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [threads])

  const handleNewChat = async () => {
    try {
      const result = await createThread({})
      setSelectedThreadId(result.threadId)
      Haptics.selectionAsync()
    } catch (error) {
      console.error('Failed to create chat:', error)
    }
  }

  const handleDeleteThread = (threadId: string) => {
    Alert.alert('Delete chat?', 'This will remove the conversation history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteThread({ threadId })
            if (selectedThreadId === threadId) {
              setSelectedThreadId(null)
            }
          } catch (error) {
            console.error('Failed to delete chat:', error)
          }
        },
      },
    ])
  }

  const handleSend = async () => {
    if (!input.trim() || isSending) return

    const message = input.trim()
    setInput('')
    setIsSending(true)

    try {
      if (!selectedThreadId) {
        const result = await startConversation({ message })
        setSelectedThreadId(result.threadId)
      } else {
        await sendMessage({ threadId: selectedThreadId, message })
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  }

  const renderThread = ({ item }: { item: Thread }) => {
    const isActive = item._id === selectedThreadId
    return (
      <TouchableOpacity
        style={[
          styles.threadPill,
          {
            backgroundColor: isActive ? colors.primary : colors.surface,
            borderColor: isActive ? colors.primary : colors.border,
          },
        ]}
        onPress={() => setSelectedThreadId(item._id)}
        onLongPress={() => handleDeleteThread(item._id)}
        activeOpacity={0.8}>
        <ThemedText
          style={[styles.threadTitle, { color: isActive ? '#fff' : colors.textPrimary }]}
          numberOfLines={1}>
          {item.title || 'New chat'}
        </ThemedText>
        <ThemedText
          style={[
            styles.threadSubtitle,
            { color: isActive ? 'rgba(255,255,255,0.8)' : colors.textMuted },
          ]}>
          {formatDate(item.updatedAt)}
        </ThemedText>
      </TouchableOpacity>
    )
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user'
    return (
      <View
        style={[
          styles.messageRow,
          { justifyContent: isUser ? 'flex-end' : 'flex-start' },
        ]}>
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isUser ? colors.primary : colors.surface,
              borderColor: isUser ? colors.primary : colors.border,
            },
          ]}>
          <ThemedText
            style={[styles.messageText, { color: isUser ? '#fff' : colors.textPrimary }]}>
            {item.content || ''}
          </ThemedText>
        </View>
      </View>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.title}>Chat</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>AI assistant</ThemedText>
        </View>
        <TouchableOpacity
          style={[styles.newButton, { backgroundColor: colors.primary }]}
          onPress={handleNewChat}
          activeOpacity={0.8}>
          <ThemedText style={styles.newButtonText}>New</ThemedText>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedThreads}
        keyExtractor={(item) => item._id}
        renderItem={renderThread}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.threadList}
        ListEmptyComponent={
          <View style={styles.emptyThreads}>
            <ThemedText style={[styles.emptyText, { color: colors.textMuted }]}>No chats yet</ThemedText>
          </View>
        }
      />

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {selectedThreadId ? (
          <FlatList
            ref={messagesRef}
            data={messages ?? []}
            keyExtractor={(item) => item._id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <IconSymbol size={48} name="paperplane.fill" color={colors.textMuted} />
            <ThemedText style={[styles.emptyTitle, { color: colors.textSecondary }]}>Start a chat</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textMuted }]}>Ask about tasks, notes, or reminders</ThemedText>
          </View>
        )}

        <View style={[styles.inputContainer, { borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Ask Kriyan..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary }]}
            onPress={handleSend}
            disabled={isSending || !input.trim()}>
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol size={18} name="paperplane.fill" color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  )
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
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  newButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  threadList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  threadPill: {
    minWidth: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  threadTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  threadSubtitle: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyThreads: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 12,
  },
  chatArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  messageList: {
    paddingVertical: 8,
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
