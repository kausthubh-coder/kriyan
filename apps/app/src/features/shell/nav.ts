// What the menu (phone) and the rail (desktop) list: Today and Inbox with their counts, the
// spaces grouped under their top-level parent, then Goals and habits, Agents and Settings.

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@kriyan/convex/api";
import { useInboxView, useSpaces, useTodayView, type SpaceNode } from "@/data/views";
import { inboxCount } from "@/features/inbox/data";

export type NavCounts = FunctionReturnType<typeof api.navigation.counts>;

export interface SpaceGroup {
  /** The top-level space the group is named after; null for the spaces with none inside them. */
  parent: SpaceNode | null;
  /** "SCHOOL", or "SPACES" for the loose ones. */
  label: string;
  spaces: { space: SpaceNode; count: number; indent: number }[];
}

/**
 * A top-level space with spaces inside it becomes a group named after it (School: CSC 316,
 * CSC 281); its own page opens from the group's name. Top-level spaces with nothing inside
 * them gather in one last group, "Spaces".
 */
export function groupSpaces(tree: SpaceNode[], counts: NavCounts | undefined): SpaceGroup[] {
  const count = new Map((counts ?? []).map((c) => [c.spaceId as string, c.open]));
  const groups: SpaceGroup[] = [];
  const loose: SpaceGroup = { parent: null, label: "SPACES", spaces: [] };
  let current: SpaceGroup | null = null;
  for (const sp of tree) {
    if (sp.depth === 0) {
      const hasChildren = tree.some((x) => x.parentId === sp._id);
      if (hasChildren) {
        current = { parent: sp, label: sp.name.toUpperCase(), spaces: [] };
        groups.push(current);
      } else {
        current = null;
        loose.spaces.push({ space: sp, count: count.get(sp._id) ?? 0, indent: 0 });
      }
      continue;
    }
    current?.spaces.push({ space: sp, count: count.get(sp._id) ?? 0, indent: sp.depth - 1 });
  }
  if (loose.spaces.length) groups.push(loose);
  return groups;
}

export function useNavCounts(): NavCounts | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.navigation.counts, isAuthenticated ? {} : "skip");
}

/** What's still open on Today: due, planned without a time, and timed tasks (not classes). */
export function useTodayCount(): number | undefined {
  const view = useTodayView();
  if (!view) return undefined;
  return (
    view.due.length +
    view.anytime.length +
    view.scheduled.filter((t) => !t.done && !t.event && !t.proposedBy).length
  );
}

export function useNav() {
  const tree = useSpaces();
  const counts = useNavCounts();
  const inbox = useInboxView();
  return {
    groups: tree ? groupSpaces(tree, counts) : undefined,
    inbox: inbox ? inboxCount(inbox) : undefined,
    today: useTodayCount(),
  };
}
