// The Inbox's two lists behind one adapter, so the screen doesn't change when the query does.
// Today views.inbox is the list of ideas (no day, no space). Design v5 contract A adds the
// older ones that Today no longer shows ("From before last week", inboxView.older); when that
// lands, only toInbox changes.

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
  return { ideas: view, older: [] };
}

export function inboxCount(view: InboxQuery): number {
  const { ideas, older } = toInbox(view);
  return ideas.length + older.length;
}
