// What the agent API returns, typed from the backend's read models so the two can't drift.
// Type-only: nothing from the backend ends up in the published bundle.

import type { goalView, inboxView, progressView, todayView, weekView } from "@kriyan/convex/model/views";
import type { searchTasks } from "@kriyan/convex/model/search";
import type { SpaceNode } from "@kriyan/convex/model/spaces";

/** JSON turns branded ids into plain strings; the shapes are otherwise identical. */
type Json<T> = T extends string & { __tableName: unknown }
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export type TodayResult = Json<Awaited<ReturnType<typeof todayView>>>;
export type WeekResult = Json<Awaited<ReturnType<typeof weekView>>>;
export type InboxResult = Json<Awaited<ReturnType<typeof inboxView>>>;
export type ProgressResult = Json<Awaited<ReturnType<typeof progressView>>>;
export type SpacesResult = Json<SpaceNode>[];
export type TaskView = TodayResult["scheduled"][number];
export type GoalView = Json<ReturnType<typeof goalView>>;
export type HabitView = TodayResult["habits"][number];
export type SearchResult = Json<Awaited<ReturnType<typeof searchTasks>>>;
