import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { components, internal } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";

const prosemirrorSync = new ProsemirrorSync(components.prosemirrorSync);

async function ensureNoteExists(ctx: { db: { get: (id: Id<"notes">) => Promise<unknown> } }, id: string) {
  const noteId = id as Id<"notes">;
  const note = await ctx.db.get(noteId);
  if (!note) {
    throw new Error("Note not found");
  }
}

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

export const {
  getSnapshot,
  submitSnapshot,
  latestVersion,
  getSteps,
  submitSteps,
} = prosemirrorSync.syncApi<DataModel>({
  checkRead: async (ctx, id) => {
    await ensureNoteExists(ctx, id);
  },
  checkWrite: async (ctx, id) => {
    await ensureNoteExists(ctx, id);
  },
  onSnapshot: async (ctx, id, snapshot) => {
    const noteId = id as Id<"notes">;
    await ctx.db.patch(noteId, { updatedAt: Date.now() });

    try {
      const parsed = JSON.parse(snapshot) as unknown;
      const text = extractTextFromDoc(parsed);

      if (text.trim().length > 0) {
        await ctx.runMutation(internal.notes.indexInRag, {
          noteId,
          content: text,
        });
      }
    } catch (error) {
      console.error("Failed to index note snapshot:", error);
    }
  },
});
