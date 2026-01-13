import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Import prosemirror-sync types
// The component will be accessed via components.prosemirrorSync

/**
 * Get the current document snapshot for a note.
 * Used to initialize the editor.
 */
export const getSnapshot = query({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.union(
    v.object({
      version: v.number(),
      doc: v.any(), // ProseMirror document JSON
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Verify note exists
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return null;
    }

    // Get snapshot from prosemirror-sync component
    // The component stores documents keyed by document ID
    try {
      const snapshot = await ctx.runQuery(
        components.prosemirrorSync.lib.getSnapshot,
        { id: args.noteId as string }
      );
      return snapshot;
    } catch {
      // No snapshot exists yet
      return null;
    }
  },
});

/**
 * Submit steps (changes) to the document.
 * Called by the TipTap editor when changes are made.
 */
export const submitSteps = mutation({
  args: {
    noteId: v.id("notes"),
    version: v.number(),
    steps: v.array(v.any()), // ProseMirror steps JSON
    clientId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    version: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify note exists
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return { success: false, error: "Note not found" };
    }

    try {
      // Submit steps to prosemirror-sync component
      const result = await ctx.runMutation(
        components.prosemirrorSync.lib.submitSteps,
        {
          id: args.noteId as string,
          version: args.version,
          steps: args.steps,
          clientId: args.clientId,
        }
      );

      // Update note's updatedAt timestamp
      await ctx.db.patch(args.noteId, {
        updatedAt: Date.now(),
      });

      return { success: true, version: result.version };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to submit steps",
      };
    }
  },
});

/**
 * Get steps since a specific version.
 * Used for syncing between clients.
 */
export const getStepsSince = query({
  args: {
    noteId: v.id("notes"),
    version: v.number(),
  },
  returns: v.union(
    v.object({
      steps: v.array(v.any()),
      clientIds: v.array(v.string()),
      version: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Verify note exists
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return null;
    }

    try {
      const result = await ctx.runQuery(
        components.prosemirrorSync.lib.getSteps,
        {
          id: args.noteId as string,
          version: args.version,
        }
      );
      return result;
    } catch {
      return null;
    }
  },
});

/**
 * Create or reset a document with initial content.
 * Used when creating a new note or resetting content.
 */
export const initializeDocument = mutation({
  args: {
    noteId: v.id("notes"),
    doc: v.optional(v.any()), // Initial ProseMirror document JSON
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify note exists
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return { success: false, error: "Note not found" };
    }

    // Default empty document
    const defaultDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [],
        },
      ],
    };

    try {
      await ctx.runMutation(components.prosemirrorSync.lib.create, {
        id: args.noteId as string,
        doc: args.doc ?? defaultDoc,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize document",
      };
    }
  },
});

/**
 * Get the latest version number for a document.
 */
export const getVersion = query({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return null;
    }

    try {
      const snapshot = await ctx.runQuery(
        components.prosemirrorSync.lib.getSnapshot,
        { id: args.noteId as string }
      );
      return snapshot?.version ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Delete document content.
 * Called when a note is deleted.
 */
export const deleteDocument = mutation({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(components.prosemirrorSync.lib.delete, {
        id: args.noteId as string,
      });
    } catch {
      // Ignore if document doesn't exist
    }
    return null;
  },
});

// ============================================
// Internal functions for AI editing
// ============================================

/**
 * Internal: Apply a transform to a document from the server.
 * Used by AI to edit notes.
 */
export const applyServerTransform = internalMutation({
  args: {
    noteId: v.id("notes"),
    steps: v.array(v.any()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) {
      return { success: false, error: "Note not found" };
    }

    try {
      // Get current version
      const snapshot = await ctx.runQuery(
        components.prosemirrorSync.lib.getSnapshot,
        { id: args.noteId as string }
      );

      if (!snapshot) {
        return { success: false, error: "Document not found" };
      }

      // Apply steps from server
      await ctx.runMutation(components.prosemirrorSync.lib.submitSteps, {
        id: args.noteId as string,
        version: snapshot.version,
        steps: args.steps,
        clientId: "server",
      });

      // Update timestamp
      await ctx.db.patch(args.noteId, {
        updatedAt: Date.now(),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Transform failed",
      };
    }
  },
});

/**
 * Internal: Get document content as plain text.
 * Used for RAG indexing.
 */
export const getDocumentText = internalQuery({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const snapshot = await ctx.runQuery(
        components.prosemirrorSync.lib.getSnapshot,
        { id: args.noteId as string }
      );

      if (!snapshot?.doc) {
        return null;
      }

      // Extract text from ProseMirror document
      return extractTextFromDoc(snapshot.doc);
    } catch {
      return null;
    }
  },
});

/**
 * Helper: Extract plain text from a ProseMirror document.
 */
function extractTextFromDoc(doc: unknown): string {
  const texts: string[] = [];

  function traverse(node: unknown): void {
    if (!node || typeof node !== "object") return;

    const n = node as Record<string, unknown>;

    if (n.type === "text" && typeof n.text === "string") {
      texts.push(n.text);
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        traverse(child);
      }
    }
  }

  traverse(doc);
  return texts.join(" ");
}
