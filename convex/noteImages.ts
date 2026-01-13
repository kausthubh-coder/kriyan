"use node";

import {
  query,
  mutation,
  internalMutation,
  internalAction,
  action,
} from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Note image validator for returns
const noteImageValidator = v.object({
  _id: v.id("noteImages"),
  _creationTime: v.number(),
  noteId: v.id("notes"),
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  description: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * Generate an upload URL for a note image.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Save uploaded image metadata and trigger description generation.
 */
export const saveImage = mutation({
  args: {
    noteId: v.id("notes"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  returns: v.id("noteImages"),
  handler: async (ctx, args) => {
    // Verify note exists
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new Error("Note not found");
    }

    const now = Date.now();

    const imageId = await ctx.db.insert("noteImages", {
      noteId: args.noteId,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      createdAt: now,
    });

    // Schedule description generation via GPT-4o vision
    await ctx.scheduler.runAfter(0, internal.noteImages.generateDescription, {
      imageId,
    });

    return imageId;
  },
});

/**
 * Get all images for a note.
 */
export const getForNote = query({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.array(
    v.object({
      _id: v.id("noteImages"),
      _creationTime: v.number(),
      noteId: v.id("notes"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      mimeType: v.string(),
      description: v.optional(v.string()),
      createdAt: v.number(),
      url: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("noteImages")
      .withIndex("by_noteId", (q) => q.eq("noteId", args.noteId))
      .collect();

    // Add URLs to each image
    const imagesWithUrls = await Promise.all(
      images.map(async (image) => ({
        ...image,
        url: await ctx.storage.getUrl(image.storageId),
      }))
    );

    return imagesWithUrls;
  },
});

/**
 * Get a single image by ID.
 */
export const get = query({
  args: {
    id: v.id("noteImages"),
  },
  returns: v.union(
    v.object({
      _id: v.id("noteImages"),
      _creationTime: v.number(),
      noteId: v.id("notes"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      mimeType: v.string(),
      description: v.optional(v.string()),
      createdAt: v.number(),
      url: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.id);
    if (!image) return null;

    return {
      ...image,
      url: await ctx.storage.getUrl(image.storageId),
    };
  },
});

/**
 * Delete an image.
 */
export const remove = mutation({
  args: {
    id: v.id("noteImages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.id);
    if (!image) {
      throw new Error("Image not found");
    }

    // Delete from storage
    await ctx.storage.delete(image.storageId);

    // Delete metadata
    await ctx.db.delete(args.id);

    return null;
  },
});

/**
 * Get image URL by storage ID.
 */
export const getUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ============================================
// Internal functions
// ============================================

/**
 * Internal: Generate image description using GPT-4o vision.
 */
export const generateDescription = internalAction({
  args: {
    imageId: v.id("noteImages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get image metadata
    const image = await ctx.runQuery(internal.noteImages.getImageMetadata, {
      imageId: args.imageId,
    });

    if (!image) {
      console.error("Image not found:", args.imageId);
      return null;
    }

    // Get settings for API key
    const settings = await ctx.runQuery(api.settings.get, {});
    const apiKey = settings?.openrouterApiKey;

    if (!apiKey) {
      console.log("No OpenRouter API key configured, skipping description generation");
      return null;
    }

    // Get image URL
    const imageUrl = await ctx.runQuery(internal.noteImages.getImageUrl, {
      storageId: image.storageId,
    });

    if (!imageUrl) {
      console.error("Could not get image URL");
      return null;
    }

    try {
      // Call GPT-4o vision via OpenRouter
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://kriyan.app",
          "X-Title": "Kriyan",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in detail. Focus on the main subjects, any text visible, and the overall context. Keep the description concise but informative, suitable for search indexing. Max 200 words.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("GPT-4o vision API error:", error);
        return null;
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      };

      const description = data.choices[0]?.message?.content;

      if (description) {
        // Save description
        await ctx.runMutation(internal.noteImages.saveDescription, {
          imageId: args.imageId,
          description,
        });
      }
    } catch (error) {
      console.error("Error generating image description:", error);
    }

    return null;
  },
});

/**
 * Internal: Get image metadata.
 */
export const getImageMetadata = internalQuery({
  args: {
    imageId: v.id("noteImages"),
  },
  returns: v.union(noteImageValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.imageId);
  },
});

/**
 * Internal: Get image URL.
 */
export const getImageUrl = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Internal: Save image description.
 */
export const saveDescription = internalMutation({
  args: {
    imageId: v.id("noteImages"),
    description: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, {
      description: args.description,
    });

    // Also index in RAG for search
    const image = await ctx.db.get(args.imageId);
    if (image) {
      // TODO: Implement RAG indexing
      // await rag.insert(ctx, {
      //   content: args.description,
      //   sourceType: "noteImage",
      //   sourceId: args.imageId,
      //   noteId: image.noteId,
      // });
    }

    return null;
  },
});

/**
 * Manually trigger description regeneration.
 */
export const regenerateDescription = action({
  args: {
    imageId: v.id("noteImages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runAction(internal.noteImages.generateDescription, {
      imageId: args.imageId,
    });
    return null;
  },
});
