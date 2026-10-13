import { v, type Infer } from "convex/values";
import type { Repeat } from "@kriyan/core/repeat";
import type { Reminder } from "@kriyan/core/reminders";
import { SPACE_COLORS, type SpaceColor } from "@kriyan/core/tokens";

const weekdayV = v.union(
  v.literal(0),
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
);

export const repeatV = v.object({
  freq: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
  interval: v.number(),
  weekdays: v.optional(v.array(weekdayV)),
  monthly: v.optional(
    v.union(
      v.object({ kind: v.literal("day"), day: v.number() }),
      v.object({ kind: v.literal("last") }),
      v.object({
        kind: v.literal("nth"),
        n: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(-1)),
        weekday: weekdayV,
      }),
    ),
  ),
  end: v.optional(
    v.union(
      v.object({ kind: v.literal("on"), date: v.string() }),
      v.object({ kind: v.literal("count"), count: v.number() }),
    ),
  ),
  fromCompletion: v.optional(v.boolean()),
});

export const reminderV = v.union(
  v.object({ kind: v.literal("before"), minutes: v.number() }),
  v.object({ kind: v.literal("day"), offset: v.number(), time: v.number() }),
);

export const colorV = v.union(...SPACE_COLORS.map((c) => v.literal(c)));

export const sourceV = v.union(v.literal("app"), v.literal("agent"));

// The validators and the shared types in @kriyan/core must describe the same shapes.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertRepeat: Same<Infer<typeof repeatV>, Repeat> = true;
const assertReminder: Same<Infer<typeof reminderV>, Reminder> = true;
const assertColor: Same<Infer<typeof colorV>, SpaceColor> = true;
export const _shapesMatch = assertRepeat && assertReminder && assertColor;
