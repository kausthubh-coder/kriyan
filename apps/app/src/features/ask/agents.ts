// Small things the Ask tab says about agents: one line per change an agent made, and the way
// to the Agents page.

import { router } from "expo-router";
import type { ActionKind } from "@kriyan/core/activity";
import type { ActionView, AskView } from "@/data/views";

/** The name model/asks.ts answers under when Kriyan did the request itself. */
export const KRIYAN = "Kriyan";

const VERB: Record<Exclude<ActionKind, "other">, string> = {
  add: "Added",
  change: "Changed",
  move: "Moved",
  done: "Ticked off",
  reopen: "Reopened",
  delete: "Deleted",
  restore: "Brought back",
};

/** 'Added "Quiz 5"'. An "other" action's title is already a phrase ("New space Thesis"). */
export function actionLine(action: Pick<ActionView, "kind" | "title">): string {
  return action.kind === "other" ? action.title : `${VERB[action.kind]} "${action.title}"`;
}

/**
 * True once we know no agent has ever been connected: no access token, nothing done by an
 * agent this week and no request an agent answered. Undefined while any of that loads, so the
 * notice never flashes.
 */
export function noAgentYet(
  tokens: unknown[] | undefined,
  activity: ActionView[] | undefined,
  asks: AskView[] | undefined,
): boolean | undefined {
  if (tokens === undefined || activity === undefined || asks === undefined) return undefined;
  return !tokens.length && !activity.length && !asks.some((a) => a.agent && a.agent !== KRIYAN);
}

/** Opens Agents, where the MCP address and what agents did live (design v5). */
export function openAgentSettings() {
  router.push("/agents");
}
