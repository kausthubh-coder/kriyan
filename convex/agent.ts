"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { kriyanAgent } from "./agentDefinition";

// ============================================
// Chat Actions (require Node.js for AI SDK)
// ============================================

/**
 * Send a message and get a response (non-streaming).
 */
export const sendMessage = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  returns: v.object({
    response: v.string(),
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await kriyanAgent.generateText(ctx, {
      threadId: args.threadId as Id<"threads">,
      prompt: args.message,
    });

    return {
      response: result.text,
      messageId: result.messageId,
    };
  },
});

/**
 * Send a message with streaming response.
 * Returns the thread ID and message ID immediately,
 * while the response streams to the client.
 */
export const sendMessageStreaming = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { messageId } = await kriyanAgent.streamText(ctx, {
      threadId: args.threadId as Id<"threads">,
      prompt: args.message,
    });

    return { messageId };
  },
});

/**
 * Start a new conversation with streaming.
 * Creates a thread and sends the first message.
 */
export const startConversation = action({
  args: {
    message: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.object({
    threadId: v.string(),
    response: v.string(),
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Create thread
    const { threadId } = await kriyanAgent.createThread(ctx, {
      title: args.title,
    });

    // Send message
    const result = await kriyanAgent.generateText(ctx, {
      threadId,
      prompt: args.message,
    });

    // Auto-generate title from first message if not provided
    if (!args.title && args.message.length > 0) {
      const titlePrompt = args.message.slice(0, 50) + (args.message.length > 50 ? "..." : "");
      await kriyanAgent.updateThread(ctx, {
        threadId,
        title: titlePrompt,
      });
    }

    return {
      threadId,
      response: result.text,
      messageId: result.messageId,
    };
  },
});
