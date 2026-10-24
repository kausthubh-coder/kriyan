// Small things the Ask tab says about agents: one line per change an agent made, and the way
// to Settings' agent section.

import { Platform } from "react-native";
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

/** Opens Settings at "Agents and automations" (its section's id is "connect-ai"). */
export function openAgentSettings() {
  router.push("/settings");
  if (Platform.OS !== "web") return;
  // Settings is long and draws its sections once the profile loads; wait for the one people
  // came for instead of leaving them at the top.
  let tries = 0;
  const find = () => {
    const section = document.getElementById("connect-ai");
    if (section) section.scrollIntoView({ block: "start" });
    else if (++tries < 40) setTimeout(find, 50);
  };
  setTimeout(find, 50);
}
