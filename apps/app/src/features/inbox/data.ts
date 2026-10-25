// The Inbox's two lists: ideas (no day, no space) and the older leftovers Today no longer shows
// ("From before last week", views.inbox `older`, past the person's earlier window).

import type { FunctionReturnType } from "convex/server";
import type { api } from "@kriyan/convex/api";
import type { TaskView } from "@/data/views";

export type InboxQuery = FunctionReturnType<typeof api.views.inbox>;

export interface InboxData {
  /** Captured with no day yet. */
  ideas: TaskView[];
  /** Planned or due before last week and never done. */
  older: TaskView[];
}

export function toInbox(view: InboxQuery): InboxData {
  return { ideas: view.tasks, older: view.older };
}

export function inboxCount(view: InboxQuery): number {
  const { ideas, older } = toInbox(view);
  return ideas.length + older.length;
}
