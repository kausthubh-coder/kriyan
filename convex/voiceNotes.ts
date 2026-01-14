import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
  action,
} from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Transcription status validator
const transcriptionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

// Full voice note validator for returns
const voiceNoteValidator = v.object({
  _id: v.id("voiceNotes"),
  _creationTime: v.number(),
  title: v.optional(v.string()),
  driveFileId: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  durationMs: v.optional(v.number()),
  transcription: v.optional(v.string()),
  transcriptionStatus: transcriptionStatusValidator,
  tags: v.array(v.string()),
  createdAt: v.number(),
});

const GOOGLE_DRIVE_API = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_DRIVE_FILES_API = "https://www.googleapis.com/drive/v3";
const OPENROUTER_API = "https://openrouter.ai/api/v1";

// ============================================
// Public Queries
// ============================================

/**
 * List all voice notes ordered by creation date (newest first).
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(voiceNoteValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const voiceNotes = await ctx.db
      .query("voiceNotes")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);

    return voiceNotes;
  },
});

/**
 * Get a single voice note by ID.
 */
export const get = query({
  args: {
    id: v.id("voiceNotes"),
  },
  returns: v.union(voiceNoteValidator, v.null()),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.id);
    return voiceNote ?? null;
  },
});

/**
 * Search voice notes by title or transcription.
 */
export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(voiceNoteValidator),
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase().trim();
    if (!searchTerm) {
      return [];
    }

    const voiceNotes = await ctx.db.query("voiceNotes").collect();

    return voiceNotes
      .filter(
        (vn) =>
          (vn.title && vn.title.toLowerCase().includes(searchTerm)) ||
          (vn.transcription &&
            vn.transcription.toLowerCase().includes(searchTerm))
      )
      .slice(0, 20);
  },
});

/**
 * Get voice notes by tag.
 */
export const getByTag = query({
  args: {
    tag: v.string(),
  },
  returns: v.array(voiceNoteValidator),
  handler: async (ctx, args) => {
    const normalizedTag = args.tag.toLowerCase().trim();

    const voiceNotes = await ctx.db.query("voiceNotes").collect();

    return voiceNotes.filter((vn) => vn.tags.includes(normalizedTag));
  },
});

/**
 * Get voice notes by transcription status.
 */
export const getByStatus = query({
  args: {
    status: transcriptionStatusValidator,
  },
  returns: v.array(voiceNoteValidator),
  handler: async (ctx, args) => {
    const voiceNotes = await ctx.db.query("voiceNotes").collect();

    return voiceNotes.filter((vn) => vn.transcriptionStatus === args.status);
  },
});

/**
 * Get the audio URL for a voice note stored in Convex.
 */
export const getAudioUrl = query({
  args: {
    id: v.id("voiceNotes"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote || !voiceNote.storageId) {
      return null;
    }

    const url = await ctx.storage.getUrl(voiceNote.storageId);
    return url;
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new voice note with audio stored in Convex storage.
 * Use this for initial creation before uploading to Google Drive.
 */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    storageId: v.id("_storage"),
    durationMs: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("voiceNotes"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tags = args.tags ?? [];

    // Process tags
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    const voiceNoteId = await ctx.db.insert("voiceNotes", {
      title: args.title,
      storageId: args.storageId,
      durationMs: args.durationMs,
      transcriptionStatus: "pending",
      tags,
      createdAt: now,
    });

    // Schedule transcription
    await ctx.scheduler.runAfter(0, internal.voiceNotes.startTranscription, {
      voiceNoteId,
    });

    return voiceNoteId;
  },
});

/**
 * Create a voice note with audio already uploaded to Google Drive.
 */
export const createFromDrive = mutation({
  args: {
    title: v.optional(v.string()),
    driveFileId: v.string(),
    durationMs: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("voiceNotes"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tags = args.tags ?? [];

    // Process tags
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    const voiceNoteId = await ctx.db.insert("voiceNotes", {
      title: args.title,
      driveFileId: args.driveFileId,
      durationMs: args.durationMs,
      transcriptionStatus: "pending",
      tags,
      createdAt: now,
    });

    // Schedule transcription
    await ctx.scheduler.runAfter(0, internal.voiceNotes.startTranscription, {
      voiceNoteId,
    });

    return voiceNoteId;
  },
});

/**
 * Update a voice note's metadata.
 */
export const update = mutation({
  args: {
    id: v.id("voiceNotes"),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote) {
      throw new Error("Voice note not found");
    }

    const updates: {
      title?: string;
      tags?: string[];
    } = {};

    if (args.title !== undefined) updates.title = args.title;

    // Handle tag changes
    if (args.tags !== undefined) {
      const oldTags = voiceNote.tags;
      const newTags = args.tags;

      // Find removed tags
      const removedTags = oldTags.filter((t) => !newTags.includes(t));
      if (removedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
          tagNames: removedTags,
        });
      }

      // Find added tags
      const addedTags = newTags.filter((t) => !oldTags.includes(t));
      if (addedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
          tagNames: addedTags,
        });
      }

      updates.tags = newTags;
    }

    await ctx.db.patch(args.id, updates);

    return null;
  },
});

/**
 * Delete a voice note.
 */
export const remove = mutation({
  args: {
    id: v.id("voiceNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote) {
      throw new Error("Voice note not found");
    }

    // Decrement tag usage
    if (voiceNote.tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
        tagNames: voiceNote.tags,
      });
    }

    // Delete from Convex storage if present
    if (voiceNote.storageId) {
      await ctx.storage.delete(voiceNote.storageId);
    }

    // Schedule Google Drive file deletion if present
    if (voiceNote.driveFileId) {
      await ctx.scheduler.runAfter(0, internal.voiceNotes.deleteFromDrive, {
        driveFileId: voiceNote.driveFileId,
      });
    }

    await ctx.db.delete(args.id);

    return null;
  },
});

/**
 * Retry transcription for a failed voice note.
 */
export const retryTranscription = mutation({
  args: {
    id: v.id("voiceNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote) {
      throw new Error("Voice note not found");
    }

    if (voiceNote.transcriptionStatus !== "failed") {
      throw new Error("Can only retry failed transcriptions");
    }

    // Reset status to pending
    await ctx.db.patch(args.id, {
      transcriptionStatus: "pending",
    });

    // Schedule transcription
    await ctx.scheduler.runAfter(0, internal.voiceNotes.startTranscription, {
      voiceNoteId: args.id,
    });

    return null;
  },
});

/**
 * Generate an upload URL for storing audio in Convex.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// ============================================
// Internal Functions
// ============================================

/**
 * Internal: Get voice note for transcription.
 */
export const getVoiceNote = internalQuery({
  args: {
    voiceNoteId: v.id("voiceNotes"),
  },
  returns: v.union(
    v.object({
      _id: v.id("voiceNotes"),
      title: v.optional(v.string()),
      driveFileId: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      transcriptionStatus: transcriptionStatusValidator,
      tags: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.voiceNoteId);
    if (!voiceNote) return null;

    return {
      _id: voiceNote._id,
      title: voiceNote.title,
      driveFileId: voiceNote.driveFileId,
      storageId: voiceNote.storageId,
      transcriptionStatus: voiceNote.transcriptionStatus,
      tags: voiceNote.tags,
    };
  },
});

/**
 * Internal: Update transcription status.
 */
export const updateTranscriptionStatus = internalMutation({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    status: transcriptionStatusValidator,
    transcription: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: {
      transcriptionStatus: "pending" | "processing" | "completed" | "failed";
      transcription?: string;
    } = {
      transcriptionStatus: args.status,
    };

    if (args.transcription !== undefined) {
      updates.transcription = args.transcription;
    }

    await ctx.db.patch(args.voiceNoteId, updates);

    return null;
  },
});

/**
 * Internal: Update Drive file ID after upload.
 */
export const setDriveFileId = internalMutation({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    driveFileId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.voiceNoteId, {
      driveFileId: args.driveFileId,
    });

    return null;
  },
});

/**
 * Internal: Start transcription process.
 */
export const startTranscription = internalAction({
  args: {
    voiceNoteId: v.id("voiceNotes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Update status to processing
    await ctx.runMutation(internal.voiceNotes.updateTranscriptionStatus, {
      voiceNoteId: args.voiceNoteId,
      status: "processing",
    });

    // Get voice note details
    const voiceNote = await ctx.runQuery(internal.voiceNotes.getVoiceNote, {
      voiceNoteId: args.voiceNoteId,
    });

    if (!voiceNote) {
      return null;
    }

    try {
      let audioData: ArrayBuffer | null = null;
      let mimeType = "audio/webm";

      // Get audio data from Convex storage or Google Drive
      if (voiceNote.storageId) {
        // Get from Convex storage
        const url = await ctx.runQuery(internal.voiceNotes.getStorageUrl, {
          storageId: voiceNote.storageId,
        });

        if (url) {
          const response = await fetch(url);
          if (response.ok) {
            audioData = await response.arrayBuffer();
            const contentType = response.headers.get("content-type");
            if (contentType) {
              mimeType = contentType;
            }
          }
        }
      } else if (voiceNote.driveFileId) {
        // Get from Google Drive
        const result = await ctx.runAction(
          internal.voiceNotes.downloadFromDrive,
          {
            driveFileId: voiceNote.driveFileId,
          }
        );

        if (result.success && result.data) {
          audioData = result.data;
          mimeType = result.mimeType || "audio/webm";
        }
      }

      if (!audioData) {
        await ctx.runMutation(internal.voiceNotes.updateTranscriptionStatus, {
          voiceNoteId: args.voiceNoteId,
          status: "failed",
        });
        return null;
      }

      // Transcribe using OpenRouter Whisper API
      const transcription = await transcribeAudio(audioData, mimeType);

      if (transcription) {
        // Update with successful transcription
        await ctx.runMutation(internal.voiceNotes.updateTranscriptionStatus, {
          voiceNoteId: args.voiceNoteId,
          status: "completed",
          transcription,
        });

        // Index in RAG
        await ctx.runMutation(internal.voiceNotes.indexInRag, {
          voiceNoteId: args.voiceNoteId,
          transcription,
          title: voiceNote.title,
          tags: voiceNote.tags,
        });

        // Upload to Google Drive if not already there
        if (voiceNote.storageId && !voiceNote.driveFileId) {
          await ctx.runAction(internal.voiceNotes.uploadToDrive, {
            voiceNoteId: args.voiceNoteId,
            audioData: Array.from(new Uint8Array(audioData)),
            mimeType,
            title: voiceNote.title || `Voice Note ${new Date().toISOString()}`,
          });
        }
      } else {
        await ctx.runMutation(internal.voiceNotes.updateTranscriptionStatus, {
          voiceNoteId: args.voiceNoteId,
          status: "failed",
        });
      }
    } catch (error) {
      console.error("Transcription error:", error);
      await ctx.runMutation(internal.voiceNotes.updateTranscriptionStatus, {
        voiceNoteId: args.voiceNoteId,
        status: "failed",
      });
    }

    return null;
  },
});

/**
 * Internal: Get storage URL for a file.
 */
export const getStorageUrl = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Internal: Download audio from Google Drive.
 */
export const downloadFromDrive = internalAction({
  args: {
    driveFileId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    data: v.optional(v.any()),
    mimeType: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    data?: ArrayBuffer;
    mimeType?: string;
    error?: string;
  }> => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      // Get file metadata first
      const metaResponse = await fetch(
        `${GOOGLE_DRIVE_FILES_API}/files/${args.driveFileId}?fields=mimeType`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!metaResponse.ok) {
        return { success: false, error: "Failed to get file metadata" };
      }

      const metadata = (await metaResponse.json()) as { mimeType: string };

      // Download file content
      const response = await fetch(
        `${GOOGLE_DRIVE_FILES_API}/files/${args.driveFileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return { success: false, error: "Failed to download file" };
      }

      const data = await response.arrayBuffer();
      return { success: true, data, mimeType: metadata.mimeType };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Upload audio to Google Drive.
 */
export const uploadToDrive = internalAction({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    audioData: v.array(v.number()), // Uint8Array as number array
    mimeType: v.string(),
    title: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    driveFileId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      // Create file metadata
      const metadata = {
        name: `${args.title}.webm`,
        mimeType: args.mimeType,
        parents: [], // Will use root folder
      };

      // Convert number array back to Uint8Array
      const audioBytes = new Uint8Array(args.audioData);

      // Create multipart upload
      const boundary = "foo_bar_baz";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadataString = JSON.stringify(metadata);

      // Manually construct the multipart body
      const encoder = new TextEncoder();
      const metaPart = encoder.encode(
        `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataString}${delimiter}Content-Type: ${args.mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
      );
      const base64Audio = Buffer.from(audioBytes).toString("base64");
      const audioPart = encoder.encode(base64Audio);
      const closePart = encoder.encode(closeDelimiter);

      const body = new Uint8Array(
        metaPart.length + audioPart.length + closePart.length
      );
      body.set(metaPart, 0);
      body.set(audioPart, metaPart.length);
      body.set(closePart, metaPart.length + audioPart.length);

      const response = await fetch(
        `${GOOGLE_DRIVE_API}/files?uploadType=multipart`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: body,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Drive upload failed: ${error}` };
      }

      const result = (await response.json()) as { id: string };

      // Update voice note with Drive file ID
      await ctx.runMutation(internal.voiceNotes.setDriveFileId, {
        voiceNoteId: args.voiceNoteId,
        driveFileId: result.id,
      });

      return { success: true, driveFileId: result.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Delete file from Google Drive.
 */
export const deleteFromDrive = internalAction({
  args: {
    driveFileId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      const response = await fetch(
        `${GOOGLE_DRIVE_FILES_API}/files/${args.driveFileId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 204 No Content or 404 Not Found are acceptable
      if (!response.ok && response.status !== 204 && response.status !== 404) {
        const error = await response.text();
        return { success: false, error: `Drive delete failed: ${error}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Index transcription in RAG.
 * Schedules an action to add the voice note to the RAG index.
 */
export const indexInRag = internalMutation({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    transcription: v.string(),
    title: v.optional(v.string()),
    tags: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.voiceNoteId);
    if (!voiceNote) return null;

    // Schedule the action to index in RAG
    await ctx.scheduler.runAfter(0, internal.voiceNotes.indexInRagAction, {
      voiceNoteId: args.voiceNoteId,
      transcription: args.transcription,
      title: args.title,
      tags: args.tags,
      createdAt: voiceNote.createdAt,
    });

    return null;
  },
});

/**
 * Internal Action: Actually index the voice note in RAG.
 */
export const indexInRagAction = internalAction({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    transcription: v.string(),
    title: v.optional(v.string()),
    tags: v.array(v.string()),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { rag, buildSearchableText, createFilterValues } = await import(
      "./rag"
    );

    const text = buildSearchableText({
      title: args.title,
      content: args.transcription,
      tags: args.tags,
    });

    try {
      await rag.add(ctx, {
        namespace: "kriyan",
        key: `voiceNote:${args.voiceNoteId}`,
        title: args.title || "Voice Note",
        text,
        filterValues: createFilterValues("voiceNote", args.tags),
        metadata: {
          sourceId: args.voiceNoteId,
          title: args.title,
          tags: args.tags,
          createdAt: args.createdAt,
        },
      });
    } catch (error) {
      console.error("Failed to index voice note in RAG:", error);
    }

    return null;
  },
});

// ============================================
// Helper Functions
// ============================================

/**
 * Transcribe audio using OpenRouter's Whisper API.
 */
async function transcribeAudio(
  audioData: ArrayBuffer,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not configured");
    return null;
  }

  try {
    // Convert audio to base64 for the API
    const base64Audio = Buffer.from(audioData).toString("base64");

    // Use OpenRouter's audio transcription endpoint
    // OpenRouter provides access to Whisper via the OpenAI-compatible API
    const response = await fetch(`${OPENROUTER_API}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kriyan.app",
        "X-Title": "Kriyan Voice Notes",
      },
      body: JSON.stringify({
        model: "openai/whisper-large-v3",
        file: base64Audio,
        response_format: "json",
      }),
    });

    if (!response.ok) {
      // Fallback: Try using the chat completions API with audio
      // Some providers support audio via chat completions
      console.log("Whisper API failed, trying fallback...");

      const fallbackResponse = await fetch(`${OPENROUTER_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://kriyan.app",
          "X-Title": "Kriyan Voice Notes",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-audio-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please transcribe the following audio accurately. Return only the transcription, nothing else.",
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: base64Audio,
                    format: mimeType.includes("wav") ? "wav" : "mp3",
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        console.error("Transcription fallback failed:", errorText);
        return null;
      }

      const fallbackResult = (await fallbackResponse.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return fallbackResult.choices?.[0]?.message?.content || null;
    }

    const result = (await response.json()) as { text: string };
    return result.text;
  } catch (error) {
    console.error("Transcription error:", error);
    return null;
  }
}
