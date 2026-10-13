import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { cancelReminders } from "./model/reminders";

export const TRASH_DAYS = 30;
const BATCH = 200;

/** Deleted tasks stay in the Trash for 30 days so they can be restored, then go for good. */
export const emptyTrash = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
    const old = await ctx.db
      .query("tasks")
      .withIndex("by_deletedAt", (q) => q.gt("deletedAt", 0).lt("deletedAt", cutoff))
      .take(BATCH);
    for (const task of old) {
      await cancelReminders(ctx, task._id);
      await ctx.db.delete(task._id);
    }
    if (old.length === BATCH) await ctx.scheduler.runAfter(0, internal.maintenance.emptyTrash, {});
  },
});
