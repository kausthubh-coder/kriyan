import { describe, expect, test } from "vitest";
import { runLines, type ActionKind } from "./activity.ts";

const act = (kind: ActionKind, title: string, at = 0) => ({
  agent: "Chitti",
  kind,
  title,
  at,
  undone: false,
});

describe("runLines", () => {
  test("one line per kind of change, in the order the agent made them", () => {
    const actions = [
      act("add", "HW17"),
      act("add", "HW18"),
      act("change", "Workshop 9"),
      act("add", "HW19"),
      act("add", "HW20"),
      act("done", "Lab 5 check-in"),
      act("other", "New space Thesis"),
    ];
    expect(runLines(actions).map((l) => [l.text, l.actions.length])).toEqual([
      ["Added HW17, HW18 and 2 more", 4],
      ["Changed Workshop 9", 1],
      ["Ticked off Lab 5 check-in", 1],
      ["New space Thesis", 1],
    ]);
  });

  test("two names are joined with and, and a title changed twice is named once", () => {
    expect(runLines([act("move", "Essay"), act("move", "Quiz")])[0]?.text).toBe("Moved Essay and Quiz");
    expect(runLines([act("change", "Essay"), act("change", "Essay")])[0]?.text).toBe("Changed Essay");
  });
});
