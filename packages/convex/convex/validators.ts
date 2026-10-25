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

/** A routine's part: Gym, 45 minutes, a habit, on Mon/Wed/Fri/Sat. */
export const routinePartV = v.object({
  title: v.string(),
  length: v.optional(v.number()),
  habitId: v.optional(v.id("habits")),
  /** 0 Monday to 6 Sunday; unset is every day. */
  weekdays: v.optional(v.array(v.number())),
});

export const todayLayoutV = v.union(v.literal("blocks"), v.literal("list"));

export const earlierWindowV = v.union(
  v.literal("none"),
  v.literal("week"),
  v.literal("month"),
  v.literal("all"),
);

export const sourceV = v.union(v.literal("app"), v.literal("agent"));

export const stepV = v.object({ title: v.string(), done: v.boolean() });

/** What an agent did, for the activity list: "added", "changed", "ticked off"... */
export const actionKindV = v.union(
  v.literal("add"),
  v.literal("change"),
  v.literal("move"),
  v.literal("done"),
  v.literal("reopen"),
  v.literal("delete"),
  v.literal("restore"),
  v.literal("other"),
);

const was = <T extends Parameters<typeof v.optional>[0]>(validator: T) =>
  v.optional(v.union(validator, v.null()));

/** A task's fields before an agent changed them; null means the field was empty. */
export const taskBeforeV = v.object({
  title: v.optional(v.string()),
  spaceId: was(v.id("spaces")),
  date: was(v.string()),
  time: was(v.number()),
  length: was(v.number()),
  deadline: was(v.string()),
  dueTime: was(v.number()),
  repeat: was(repeatV),
  reminders: was(v.array(reminderV)),
  note: was(v.string()),
  steps: was(v.array(stepV)),
  event: was(v.boolean()),
  goalId: was(v.id("goals")),
  externalId: was(v.string()),
});

// The validators and the shared types in @kriyan/core must describe the same shapes.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertRepeat: Same<Infer<typeof repeatV>, Repeat> = true;
const assertReminder: Same<Infer<typeof reminderV>, Reminder> = true;
const assertColor: Same<Infer<typeof colorV>, SpaceColor> = true;
export const _shapesMatch = assertRepeat && assertReminder && assertColor;
