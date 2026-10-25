// What agents did, grouped into runs and said in a sentence: "Codex added 3 and changed 1".

export type ActionKind = "add" | "change" | "move" | "done" | "reopen" | "delete" | "restore" | "other";

export interface Action {
  agent: string;
  kind: ActionKind;
  /** Epoch milliseconds. */
  at: number;
  undone: boolean;
}

export interface Run<A extends Action> {
  agent: string;
  /** When the run started: its first action. */
  at: number;
  actions: A[];
}

/** Actions by one agent that follow each other within this gap are one run. */
const RUN_GAP = 30 * 60_000;

/** Groups actions (any order) into runs, newest run first, each run's actions oldest first. */
export function groupRuns<A extends Action>(actions: A[]): Run<A>[] {
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  const open = new Map<string, Run<A>>();
  const runs: Run<A>[] = [];
  for (const action of sorted) {
    const run = open.get(action.agent);
    const last = run?.actions.at(-1);
    if (run && last && action.at - last.at <= RUN_GAP) run.actions.push(action);
    else {
      const fresh = { agent: action.agent, at: action.at, actions: [action] };
      open.set(action.agent, fresh);
      runs.push(fresh);
    }
  }
  return runs.sort((a, b) => b.at - a.at);
}

const VERBS: [ActionKind[], string][] = [
  [["add"], "added"],
  [["change"], "changed"],
  [["move"], "moved"],
  [["done"], "ticked off"],
  [["delete"], "deleted"],
  [["reopen", "restore"], "brought back"],
  [["other"], "made"],
];

/** "added 3 and changed 1", counting only what wasn't undone. Empty when everything was. */
export function runSummary(actions: Action[]): string {
  const live = actions.filter((a) => !a.undone);
  const parts: string[] = [];
  for (const [kinds, verb] of VERBS) {
    const n = live.filter((a) => kinds.includes(a.kind)).length;
    if (n)
      parts.push(
        kinds[0] === "other" ? `${verb} ${n} other ${n === 1 ? "change" : "changes"}` : `${verb} ${n}`,
      );
  }
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const LINE_VERB: Record<Exclude<ActionKind, "other">, string> = {
  add: "Added",
  change: "Changed",
  move: "Moved",
  done: "Ticked off",
  reopen: "Reopened",
  delete: "Deleted",
  restore: "Brought back",
};

/** "HW17", "HW17 and HW18", "HW17, HW18 and 29 more". */
function nameSome(titles: string[]): string {
  if (titles.length <= 2) return titles.join(" and ");
  return `${titles.slice(0, 2).join(", ")} and ${titles.length - 2} more`;
}

export interface RunLine<A> {
  /** "Added HW17, HW18 and 29 more". */
  text: string;
  /** The actions the line stands for, which its Undo puts back. */
  actions: A[];
}

/**
 * What an "other" action's title shares with its neighbours: the words before a colon ("Logged
 * Lose 5 kg: 0.3 kg"), or its first two ("New space Thesis"). Lines group on it.
 */
function otherHead(title: string): [head: string, rest: string] {
  const colon = title.indexOf(":");
  if (colon > 0) return [title.slice(0, colon + 1), title.slice(colon + 1).trim()];
  const words = title.split(" ");
  return words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [title, ""];
}

/**
 * A run as the Agents page lists it: one line per kind of change, in the order the agent made
 * them ("Added HW17, HW18 and 29 more", "Ticked off Lab 5 check-in"). An "other" action's title
 * is already a phrase ("New space Thesis"), so those group by how they start ("New space
 * Work, School and 2 more").
 */
export function runLines<A extends Action & { title: string }>(actions: A[]): RunLine<A>[] {
  const lines: (RunLine<A> & { head: string; names: string[] })[] = [];
  const byKey = new Map<string, (typeof lines)[number]>();
  for (const action of actions) {
    const [head, rest] =
      action.kind === "other" ? otherHead(action.title) : [LINE_VERB[action.kind], action.title];
    const key = `${action.kind}|${head}`;
    const line = byKey.get(key);
    if (line) {
      line.actions.push(action);
      if (rest && !line.names.includes(rest)) line.names.push(rest);
    } else {
      const fresh = { text: "", head, names: rest ? [rest] : [], actions: [action] };
      byKey.set(key, fresh);
      lines.push(fresh);
    }
  }
  return lines.map(({ head, names, actions: list }) => ({
    text: names.length ? `${head} ${nameSome(names)}` : head,
    actions: list,
  }));
}
