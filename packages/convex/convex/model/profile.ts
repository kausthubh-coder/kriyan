// The person's settings: their day, capacity, default reminders, review time and semester.
// The app's Settings and agents' update_settings both change them through updateSettings.

import { ConvexError } from "convex/values";
import { isCivilDate } from "@kriyan/core/dates";
import type { Reminder } from "@kriyan/core/reminders";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getProfile } from "./owner";
import { checkReminders } from "./tasks";

export interface SettingsPatch {
  dayStart?: number;
  dayEnd?: number;
  dailyCapacity?: number;
  defaultReminders?: Reminder[];
  agentsEditDirectly?: boolean;
  onboarded?: boolean;
  reviewTime?: number;
  sounds?: boolean;
  /** null clears the semester. */
  semesterStart?: string | null;
  semesterEnd?: string | null;
}

export async function updateSettings(ctx: MutationCtx, ownerId: string, patch: SettingsPatch): Promise<void> {
  const row = await ctx.db
    .query("profiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  if (!row) throw new ConvexError("Open the app once to create your profile.");
  const dayStart = patch.dayStart ?? row.dayStart;
  const dayEnd = patch.dayEnd ?? row.dayEnd;
  if (
    !Number.isInteger(dayStart) ||
    !Number.isInteger(dayEnd) ||
    dayStart < 0 ||
    dayEnd > 1440 ||
    dayEnd <= dayStart
  )
    throw new ConvexError("Your day must end after it starts.");
  if (
    patch.dailyCapacity !== undefined &&
    (!Number.isInteger(patch.dailyCapacity) || patch.dailyCapacity < 0 || patch.dailyCapacity > 1440)
  )
    throw new ConvexError("A day can hold from 0 to 24 hours of planned work.");
  // Every new timed task copies these, so they get the same checks as a task's own.
  if (patch.defaultReminders) checkReminders(patch.defaultReminders);
  if (
    patch.reviewTime !== undefined &&
    (!Number.isInteger(patch.reviewTime) || patch.reviewTime < 0 || patch.reviewTime > 1439)
  )
    throw new ConvexError("The review time must be within the day.");
  for (const key of ["semesterStart", "semesterEnd"] as const) {
    const value = patch[key];
    if (value && !isCivilDate(value)) throw new ConvexError("Semester dates look like 2026-10-13.");
  }
  const start = patch.semesterStart === undefined ? row.semesterStart : (patch.semesterStart ?? undefined);
  const end = patch.semesterEnd === undefined ? row.semesterEnd : (patch.semesterEnd ?? undefined);
  if (start && end && end <= start) throw new ConvexError("The semester must end after it starts.");
  const { onboarded, semesterStart, semesterEnd, ...rest } = patch;
  await ctx.db.patch(row._id, {
    ...rest,
    ...(semesterStart !== undefined ? { semesterStart: semesterStart ?? undefined } : {}),
    ...(semesterEnd !== undefined ? { semesterEnd: semesterEnd ?? undefined } : {}),
    ...(onboarded ? { onboardedAt: Date.now() } : {}),
  });
}

/** The settings an agent reads, with times in minutes after midnight. */
export async function settingsView(ctx: QueryCtx, ownerId: string) {
  const p = await getProfile(ctx, ownerId);
  return {
    timeZone: p.timeZone,
    dayStart: p.dayStart,
    dayEnd: p.dayEnd,
    dailyCapacity: p.dailyCapacity,
    defaultReminders: p.defaultReminders,
    /** Unset means 20:00, as Today shows it. */
    reviewTime: p.reviewTime ?? 20 * 60,
    agentsEditDirectly: p.agentsEditDirectly,
    sounds: p.sounds ?? false,
    semesterStart: p.semesterStart ?? null,
    semesterEnd: p.semesterEnd ?? null,
  };
}
