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
    if (n) parts.push(kinds[0] === "other" ? `${verb} ${n} other ${n === 1 ? "change" : "changes"}` : `${verb} ${n}`);
  }
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
