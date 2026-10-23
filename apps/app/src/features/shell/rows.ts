// Task rows on screen, so keyboard shortcuts can act on the selected one.

import type { TaskView } from "@/data/views";

export const rowRegistry = new Map<
  string,
  Pick<TaskView, "_id" | "title" | "done" | "repeat" | "date" | "time" | "event">
>();
