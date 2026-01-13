import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const crons = cronJobs();

/**
 * Check for due reminders every minute.
 * This cron job runs every minute to check if any reminders are due
 * and triggers notifications for them.
 */
crons.interval(
  "check due reminders",
  { minutes: 1 },
  internal.crons.processDueReminders,
  {}
);

/**
 * Process all due reminders.
 * This is called by the cron job to find and process reminders that need to be sent.
 */
export const processDueReminders = internalAction({
  args: {},
  returns: v.object({
    processed: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    // Get all due reminders
    const dueReminders = await ctx.runQuery(
      internal.reminders.getDueReminders,
      {}
    );

    let processed = 0;
    let errors = 0;

    for (const reminder of dueReminders) {
      try {
        // Send notification
        await ctx.runAction(internal.notifications.sendReminderNotification, {
          reminderId: reminder._id,
        });
        processed++;
      } catch (error) {
        console.error(
          `Error processing reminder ${reminder._id}:`,
          error instanceof Error ? error.message : error
        );
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      console.log(
        `Processed ${processed} reminders, ${errors} errors`
      );
    }

    return { processed, errors };
  },
});

export default crons;
