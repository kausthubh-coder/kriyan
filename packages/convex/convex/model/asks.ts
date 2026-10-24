// The Ask tab. A request Kriyan understands on its own (core/ask.ts) is done at once and answered
// as "Kriyan"; anything else waits for an agent, which reads it with get_asks and replies with
// answer_ask. The changes an agent made in between are listed under its reply, each with Undo.

import { ConvexError } from "convex/values";
import { understand } from "@kriyan/core/ask";
import { addDays, weekday, zonedParts, type CivilDate } from "@kriyan/core/dates";
import { formatDay, formatDuration, formatTime } from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { parseTask } from "@kriyan/core/parse";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recent, type ActionView } from "./activity";
import { getProfile } from "./owner";
import * as Tasks from "./tasks";
import * as Views from "./views";

/** The name Kriyan answers under when it did the request itself. */
export const KRIYAN = "Kriyan";

const MAX_TEXT = 1000;
const MAX_REPLY = 2000;

/** Takes one request: does it when Kriyan can, otherwise leaves it waiting for an agent. */
export async function send(ctx: MutationCtx, ownerId: string, raw: string): Promise<Id<"asks">> {
  const text = raw.trim();
  if (!text) throw new ConvexError("Type what you'd like to do.");
  if (text.length > MAX_TEXT) throw new ConvexError(`Keep it under ${MAX_TEXT} characters.`);
  const profile = await getProfile(ctx, ownerId);
  const { date: today, minutes: now } = zonedParts(Date.now(), profile.timeZone);
  const intent = understand(text, (t) => {
    const parsed = parseTask(t, today);
    return parsed.date !== undefined || parsed.time !== undefined;
  });
  const answered = (reply: string, done: Partial<Doc<"asks">> = {}) =>
    ctx.db.insert("asks", { ownerId, text, reply, agent: KRIYAN, answeredAt: Date.now(), ...done });

  switch (intent.kind) {
    case "add": {
      const taskId = await Tasks.addFromText(ctx, ownerId, intent.text, { source: "app" });
      const task = (await ctx.db.get(taskId))!;
      const when = [
        task.date ? inSentence(formatDay(task.date, today)) : "the Inbox",
        task.time !== undefined ? `at ${formatTime(task.time)}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return answered(`Added "${task.title}" to ${when}.`, { taskIds: [taskId] });
    }
    case "tomorrow": {
      const moved = await Tasks.closeDay(ctx, ownerId, today);
      if (!moved.length) return answered("Nothing's left on today, so there was nothing to move.");
      return answered(`Moved ${moved.length} to tomorrow: ${listTitles(moved.map((t) => t.title))}.`, {
        moved: moved.map((t) => ({ taskId: t._id, date: t.date })),
      });
    }
    case "free": {
      const day = await Views.todayView(ctx, ownerId, today);
      const blocks = day.scheduled
        .filter((t) => !t.done && t.length)
        .map((t) => ({ id: t._id, start: t.time!, length: t.length! }));
      const free = freeMinutes(blocks, now, profile.dayEnd);
      if (free <= 0) return answered(`Your day is full until ${formatTime(profile.dayEnd)}.`);
      const gap = longestGap(blocks, now, profile.dayEnd);
      return answered(
        `${formatDuration(free)} free until ${formatTime(profile.dayEnd)}.` +
          (gap ? ` The longest stretch is ${formatTime(gap[0])} to ${formatTime(gap[1])}.` : ""),
      );
    }
    case "next": {
      const day = await Views.todayView(ctx, ownerId, today);
      const timed = day.scheduled
        .filter((t) => !t.done && t.time! + (t.length ?? 0) >= now)
        .sort((a, b) => a.time! - b.time!);
      const next = timed[0];
      if (next) return answered(`Next is ${next.title} at ${formatTime(next.time!)}.`);
      const anytime = day.anytime.find((t) => t.proposedBy === null);
      if (anytime)
        return answered(`Nothing else has a time today. ${anytime.title} is on your list for anytime.`);
      return answered("Nothing else is planned today.");
    }
    case "week": {
      const progress = await Views.progressView(ctx, ownerId, today);
      const weekStart = addDays(today, -weekday(today));
      const done = await ctx.db
        .query("completions")
        .withIndex("by_owner_and_doneOn", (q) =>
          q.eq("ownerId", ownerId).gte("doneOn", weekStart).lte("doneOn", today),
        )
        .take(1000);
      const focused = await focusedSince(ctx, ownerId, weekStart, today);
      const top = progress.bySpace[0];
      const parts = [`This week you've finished ${plural(done.length, "task")}`];
      if (focused) parts.push(`focused for ${formatDuration(focused)}`);
      return answered(
        `${parts.join(" and ")}.` + (top && top.minutes ? ` Most of your time went to ${top.name}.` : ""),
      );
    }
    case "agent":
      return ctx.db.insert("asks", { ownerId, text });
  }
}

/** "Tomorrow" reads as "tomorrow" in the middle of a sentence; "Tue 13 Oct" stays. */
const inSentence = (day: string) => (/^(Today|Tomorrow|Yesterday)$/.test(day) ? day.toLowerCase() : day);

function listTitles(titles: string[]): string {
  const shown = titles.slice(0, 3).map((t) => `"${t}"`);
  if (titles.length > 3) return `${shown.join(", ")} and ${titles.length - 3} more`;
  if (shown.length < 2) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The longest free stretch between now and the end of the day, as [start, end] minutes. */
function longestGap(blocks: { start: number; length: number }[], now: number, dayEnd: number) {
  const busy = blocks.map((b) => [b.start, b.start + b.length] as const).sort((a, b) => a[0] - b[0]);
  let best: [number, number] | null = null;
  let from = now;
  for (const [s, e] of [...busy, [dayEnd, dayEnd] as const]) {
    const end = Math.min(s, dayEnd);
    if (end - from > (best ? best[1] - best[0] : 0)) best = [from, end];
    from = Math.max(from, e);
  }
  return best && best[1] - best[0] >= 15 ? best : null;
}

async function focusedSince(ctx: QueryCtx, ownerId: string, from: CivilDate, to: CivilDate) {
  const rows = await ctx.db
    .query("focusSessions")
    .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).gte("date", from).lte("date", to))
    .take(2000);
  return rows.reduce((sum, r) => sum + r.minutes, 0);
}

/** Requests still waiting for an agent, oldest first. */
export async function waiting(ctx: QueryCtx, ownerId: string) {
  const rows = await ctx.db
    .query("asks")
    .withIndex("by_owner_and_answeredAt", (q) => q.eq("ownerId", ownerId).eq("answeredAt", undefined))
    .take(50);
  return rows.map((r) => ({ askId: r._id, text: r.text, askedAt: new Date(r._creationTime).toISOString() }));
}

export async function answer(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"asks">,
  agent: string,
  raw: string,
): Promise<void> {
  const row = await ctx.db.get(id);
  if (!row || row.ownerId !== ownerId) throw new ConvexError("That request doesn't exist or isn't yours.");
  const reply = raw.trim();
  if (!reply) throw new ConvexError("Write a reply.");
  if (reply.length > MAX_REPLY) throw new ConvexError(`Keep the reply under ${MAX_REPLY} characters.`);
  if (row.agent === KRIYAN) throw new ConvexError("Kriyan already answered that one.");
  await ctx.db.patch(id, { reply, agent, answeredAt: Date.now() });
}

export interface AskView {
  _id: Id<"asks">;
  text: string;
  at: number;
  reply: string | null;
  agent: string | null;
  /** What the agent changed between the request and its reply, each with Undo. */
  changes: ActionView[];
  /** Kriyan's own change (an add or a move to tomorrow) can be undone as a whole. */
  undoable: boolean;
  undone: boolean;
}

/** The latest requests, oldest first, as the Ask tab shows them. */
export async function list(ctx: QueryCtx, ownerId: string): Promise<AskView[]> {
  const rows = (
    await ctx.db
      .query("asks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(30)
  ).reverse();
  const first = rows[0]?._creationTime;
  const actions = first === undefined ? [] : await recent(ctx, ownerId, first, 500);
  return rows.map((r) => ({
    _id: r._id,
    text: r.text,
    at: r._creationTime,
    reply: r.reply ?? null,
    agent: r.agent ?? null,
    changes:
      r.agent && r.agent !== KRIYAN && r.answeredAt
        ? actions
            .filter((a) => a.agent === r.agent && a.at >= r._creationTime && a.at <= r.answeredAt!)
            .reverse()
        : [],
    undoable: Boolean((r.taskIds?.length || r.moved?.length) && r.undoneAt === undefined),
    undone: r.undoneAt !== undefined,
  }));
}

/** Undoes what Kriyan did for a request: removes the task it added, or moves tasks back. */
export async function undo(ctx: MutationCtx, ownerId: string, id: Id<"asks">): Promise<void> {
  const row = await ctx.db.get(id);
  if (!row || row.ownerId !== ownerId) throw new ConvexError("That request doesn't exist or isn't yours.");
  if (row.undoneAt !== undefined) return;
  for (const taskId of row.taskIds ?? []) {
    const task = await ctx.db.get(taskId);
    if (task && task.deletedAt === undefined) await Tasks.deleteTask(ctx, ownerId, taskId);
  }
  for (const m of row.moved ?? []) {
    const task = await ctx.db.get(m.taskId);
    if (task && task.deletedAt === undefined && task.doneAt === undefined)
      await Tasks.updateTask(ctx, ownerId, m.taskId, { date: m.date });
  }
  await ctx.db.patch(id, { undoneAt: Date.now() });
}

/** Removes the conversation; the tasks it made stay. */
export async function clear(ctx: MutationCtx, ownerId: string): Promise<void> {
  const rows = await ctx.db
    .query("asks")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(500);
  for (const r of rows) await ctx.db.delete(r._id);
}
