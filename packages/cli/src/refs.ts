// Naming tasks on the command line, and reading "when" phrases with the quick-add grammar.

import type { CivilDate } from "@kriyan/core/dates";
import { parseTask } from "@kriyan/core/parse";

export type TaskRef =
  { kind: "number"; n: number } | { kind: "id"; id: string } | { kind: "title"; text: string };

/** "3" is the third task of the last listing, a long lowercase token is an id, anything else part of a title. */
export function classifyRef(text: string): TaskRef {
  const t = text.trim();
  if (/^\d{1,4}$/.test(t)) return { kind: "number", n: Number(t) };
  if (/^[0-9a-z]{20,40}$/.test(t) && /\d/.test(t)) return { kind: "id", id: t };
  return { kind: "title", text: t };
}

export interface Candidate {
  _id: string;
  title: string;
}

export type TitleMatch<T extends Candidate> =
  { kind: "one"; task: T } | { kind: "many"; tasks: T[] } | { kind: "none" };

/** Case-insensitive part of a title. An exact title wins over partial ones. */
export function matchTitle<T extends Candidate>(candidates: T[], text: string): TitleMatch<T> {
  const needle = text.toLowerCase().replace(/\s+/g, " ").trim();
  const unique = [...new Map(candidates.map((c) => [c._id, c])).values()];
  const exact = unique.filter((c) => c.title.toLowerCase() === needle);
  if (exact.length === 1) return { kind: "one", task: exact[0]! };
  const found = unique.filter((c) => c.title.toLowerCase().includes(needle));
  if (found.length === 1) return { kind: "one", task: found[0]! };
  return found.length ? { kind: "many", tasks: found } : { kind: "none" };
}

export interface When {
  date: CivilDate;
  /** Minutes after midnight, when the phrase named a time. */
  time?: number;
}

/** "tomorrow", "fri 9am", "13 oct at 14:30", "at 5": a date and maybe a time; a time alone means today. */
export function parseWhen(phrase: string, today: CivilDate): When | null {
  if (!phrase.trim()) return null;
  const parsed = parseTask(phrase, today);
  if (parsed.title !== "" || parsed.spans.some((s) => s.kind !== "date" && s.kind !== "time")) return null;
  if (!parsed.date && parsed.time === undefined) return null;
  return { date: parsed.date ?? today, ...(parsed.time !== undefined ? { time: parsed.time } : {}) };
}

/**
 * `move 2 5 fri 9am`: everything before the longest trailing date phrase names tasks.
 */
export function splitMove(args: string[], today: CivilDate): { refs: string[]; when: When } | null {
  for (let k = 1; k < args.length; k++) {
    const when = parseWhen(args.slice(k).join(" "), today);
    if (when) return { refs: args.slice(0, k), when };
  }
  return null;
}
