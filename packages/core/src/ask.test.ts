import { describe, expect, test } from "vitest";
import { groupRuns, runSummary, type Action } from "./activity";
import { understand } from "./ask";
import { parseTask } from "./parse";

const hasWhen = (t: string) => {
  const p = parseTask(t, "2026-10-13");
  return p.date !== undefined || p.time !== undefined;
};

describe("what Ask understands on its own", () => {
  test.each([
    ["Add call mum tomorrow 18:00", { kind: "add", text: "call mum tomorrow 18:00" }],
    ["remind me to pay rent fri", { kind: "add", text: "pay rent fri" }],
    ["dentist fri 10am", { kind: "add", text: "dentist fri 10am" }],
    ["Move what's left to tomorrow", { kind: "tomorrow" }],
    ["push everything unfinished to tomorrow", { kind: "tomorrow" }],
    ["How much free time do I have?", { kind: "free" }],
    ["what's next", { kind: "next" }],
    ["How did my week go?", { kind: "week" }],
  ])("%s", (text, intent) => {
    expect(understand(text, hasWhen)).toEqual(intent);
  });

  test.each([
    "Move the lab report to 14:00",
    "Plan my study for the exam on fri",
    "Can I fit a run in tomorrow at 7?",
    "add",
    "",
  ])("leaves %j to an agent", (text) => {
    expect(understand(text, hasWhen)).toEqual({ kind: "agent" });
  });
});

describe("agent runs", () => {
  const at = (h: number, m: number) => Date.UTC(2026, 9, 13, h, m);
  const a = (agent: string, kind: Action["kind"], when: number, undone = false): Action => ({
    agent,
    kind,
    at: when,
    undone,
  });

  test("one agent's actions within half an hour are one run; newest run first", () => {
    const runs = groupRuns([
      a("Codex", "add", at(7, 0)),
      a("Codex", "add", at(7, 1)),
      a("Claude", "move", at(7, 5)),
      a("Codex", "change", at(7, 20)),
      a("Codex", "add", at(9, 0)),
    ]);
    expect(runs.map((r) => [r.agent, new Date(r.at).toISOString().slice(11, 16), r.actions.length])).toEqual([
      ["Codex", "09:00", 1],
      ["Claude", "07:05", 1],
      ["Codex", "07:00", 3],
    ]);
  });

  test("a run says what it did, leaving out what was undone", () => {
    expect(
      runSummary([
        a("Codex", "add", 1),
        a("Codex", "add", 2),
        a("Codex", "add", 3, true),
        a("Codex", "change", 4),
        a("Codex", "other", 5),
      ]),
    ).toBe("added 2, changed 1 and made 1 other change");
    expect(runSummary([a("Codex", "add", 1, true)])).toBe("");
  });
});
