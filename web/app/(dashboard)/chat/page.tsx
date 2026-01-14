"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  _id: string;
  role: string;
  content?: string;
  createdAt: number;
}

interface Thread {
  _id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export default function ChatPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const threads = useQuery(api.agentThreads.listThreads, { limit: 50 }) as Thread[] | undefined;
  const messages = useQuery(
    api.agentThreads.getThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId, limit: 100 } : "skip"
  ) as Message[] | undefined;

  // Actions
  const startConversation = useAction(api.agent.startConversation);
  const sendMessage = useAction(api.agent.sendMessage);
  const createThread = useMutation(api.agentThreads.createThread);
  const deleteThread = useMutation(api.agentThreads.deleteThread);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingResponse]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setStreamingResponse("");

    try {
      if (!selectedThreadId) {
        // Start new conversation
        const result = await startConversation({
          message: userMessage,
        });
        setSelectedThreadId(result.threadId);
      } else {
        // Send to existing thread
        await sendMessage({
          threadId: selectedThreadId,
          message: userMessage,
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
      setStreamingResponse("");
    }
  };

  const handleNewChat = async () => {
    const result = await createThread({});
    setSelectedThreadId(result.threadId);
  };

  const handleDeleteThread = async (threadId: string) => {
    await deleteThread({ threadId });
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      {/* Thread List */}
      <div className="w-64 flex-shrink-0 glass rounded-xl border border-glass-border flex flex-col">
        <div className="p-4 border-b border-glass-border flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Chats</h2>
          <Button variant="ghost" size="sm" onClick={handleNewChat}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads?.length === 0 && (
            <p className="text-text-muted text-sm text-center py-4">No conversations yet</p>
          )}
          {threads?.map((thread) => (
            <div
              key={thread._id}
              onClick={() => setSelectedThreadId(thread._id)}
              className={`group p-3 rounded-lg cursor-pointer transition-all ${
                selectedThreadId === thread._id
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-glass-hover text-text-secondary"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate flex-1">
                  {thread.title || "New Chat"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteThread(thread._id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-error/20 rounded transition-all"
                >
                  <svg className="w-3 h-3 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-text-muted mt-1">{formatDate(thread.updatedAt)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 glass rounded-xl border border-glass-border flex flex-col">
        {selectedThreadId ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages?.map((message) => (
                <div
                  key={message._id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-white"
                        : "bg-glass-hover text-text-primary"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content || ""}</p>
                  </div>
                </div>
              ))}
              
              {/* Streaming response */}
              {streamingResponse && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-glass-hover text-text-primary">
                    <p className="whitespace-pre-wrap">{streamingResponse}</p>
                  </div>
                </div>
              )}
              
              {/* Loading indicator */}
              {isLoading && !streamingResponse && (
                <div className="flex justify-start">
                  <div className="bg-glass-hover rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-glass-border">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type your message..."
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </Button>
              </div>
            </div>
          </>
        ) : (
          // Empty state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-2">Start a conversation</h3>
              <p className="text-text-secondary mb-4">Select a chat or start a new one</p>
              <Button onClick={handleNewChat}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
