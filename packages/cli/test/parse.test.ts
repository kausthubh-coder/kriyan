// How the command line is read: task references, "when" phrases, options, the add echo and colour.

import { parseTask } from "@kriyan/core/parse";
import { schemes } from "@kriyan/core/tokens";

const spaceColor = schemes.dark.space;
import { describe, expect, test } from "vitest";
import { parseArgs, UsageError } from "../src/args.ts";
import { classifyRef, matchTitle, parseWhen, splitMove } from "../src/refs.ts";
import { RefBook, renderToday } from "../src/render.ts";
import { describeParsed } from "../src/run.ts";
import * as f from "./fixtures.ts";

// Tuesday.
const TODAY = "2026-10-13";

describe("task references", () => {
  test("numbers, ids and titles", () => {
    expect(classifyRef("3")).toEqual({ kind: "number", n: 3 });
    expect(classifyRef("k57essay000000000000000000000002")).toEqual({
      kind: "id",
      id: "k57essay000000000000000000000002",
    });
    expect(classifyRef("essay")).toEqual({ kind: "title", text: "essay" });
    // A long word without digits is still a title.
    expect(classifyRef("internationalisation")).toEqual({ kind: "title", text: "internationalisation" });
  });

  test("a title fragment matches case-insensitively; an exact title beats partial ones", () => {
    const tasks = [
      { _id: "a", title: "Essay" },
      { _id: "b", title: "Essay plan" },
      { _id: "c", title: "Call mum" },
    ];
    expect(matchTitle(tasks, "MUM")).toEqual({ kind: "one", task: tasks[2] });
    expect(matchTitle(tasks, "essay")).toEqual({ kind: "one", task: tasks[0] });
    expect(matchTitle(tasks, "ess")).toEqual({ kind: "many", tasks: [tasks[0], tasks[1]] });
    expect(matchTitle(tasks, "dentist")).toEqual({ kind: "none" });
  });

  test("the same task listed twice counts once", () => {
    const t = { _id: "a", title: "Calculus lecture" };
    expect(matchTitle([t, { ...t }], "calc")).toEqual({ kind: "one", task: t });
  });

  test("numbers follow the order tasks are shown, and repeats keep their first number", () => {
    const refs = new RefBook();
    expect([
      refs.ref({ _id: "a", title: "A" }),
      refs.ref({ _id: "b", title: "B" }),
      refs.ref({ _id: "a", title: "A" }),
    ]).toEqual(["1", "2", "1"]);
    expect(refs.tasks).toEqual([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ]);
  });
});

describe("when phrases", () => {
  test.each([
    ["tomorrow", { date: "2026-10-14" }],
    ["fri", { date: "2026-10-16" }],
    ["next mon", { date: "2026-10-19" }],
    ["13 oct", { date: "2026-10-13" }],
    ["1 nov 14:30", { date: "2026-11-01", time: 870 }],
    ["fri 9am", { date: "2026-10-16", time: 540 }],
    ["tomorrow at 5", { date: "2026-10-14", time: 1020 }],
    ["at 5", { date: TODAY, time: 1020 }],
    ["in 3 days", { date: "2026-10-16" }],
    ["2026-12-01", { date: "2026-12-01" }],
  ])("%s", (phrase, expected) => {
    expect(parseWhen(phrase, TODAY)).toEqual(expected);
  });

  test("anything besides a date and a time is not a when", () => {
    const read = (phrase: string) => parseWhen(phrase, TODAY);
    expect(read("fri")).toEqual({ date: "2026-10-16" });
    for (const phrase of [
      "",
      "essay",
      "fri #school",
      "every fri",
      "fri for 1h",
      "tomorrow remind 1h before",
      "5",
    ])
      expect(read(phrase), phrase).toBeNull();
  });

  test("move splits task references from the longest trailing when", () => {
    expect(splitMove(["3", "5", "fri", "9am"], TODAY)).toEqual({
      refs: ["3", "5"],
      when: { date: "2026-10-16", time: 540 },
    });
    expect(splitMove(["problem", "set", "tomorrow"], TODAY)).toEqual({
      refs: ["problem", "set"],
      when: { date: "2026-10-14" },
    });
    expect(splitMove(["essay", "13", "oct", "at", "14:30"], TODAY)).toEqual({
      refs: ["essay"],
      when: { date: "2026-10-13", time: 870 },
    });
    expect(splitMove(["3"], TODAY)).toBeNull();
    expect(splitMove(["fri"], TODAY)).toBeNull();
  });
});

describe("options", () => {
  test("flags anywhere, values inline or next", () => {
    expect(parseArgs(["propose", "--agent=Claude", "--file", "plan.json", "--json"])).toEqual({
      positionals: ["propose"],
      json: true,
      help: false,
      version: false,
      undo: false,
      token: undefined,
      agent: "Claude",
      file: "plan.json",
    });
    expect(parseArgs(["add", "--", "--not a flag"]).positionals).toEqual(["add", "--not a flag"]);
    expect(parseArgs(["propose", "--file", "-"]).file).toBe("-");
  });

  test("unknown flags and missing values are usage errors", () => {
    expect(() => parseArgs(["today", "--yesterday"])).toThrow(UsageError);
    expect(() => parseArgs(["login", "--token"])).toThrow("--token needs a value.");
  });
});

describe("what add understood", () => {
  test("a class every Tue and Thu", () => {
    const parsed = parseTask("calculus lecture every tue and thu 10:00-11:30 #school", TODAY);
    expect(parsed.title).toBe("calculus lecture");
    expect(describeParsed(parsed, TODAY)).toEqual([
      "  Date     Today, Tue 13 Oct",
      "  Time     10:00–11:30",
      "  Space    school",
      "  Repeats  Every Tue and Thu",
    ]);
  });

  test("a birthday every year with a reminder the day before", () => {
    const parsed = parseTask("mum's birthday 16 oct every year remind day before at 20:00", TODAY);
    expect(parsed.title).toBe("mum's birthday");
    expect(describeParsed(parsed, TODAY)).toEqual([
      "  Date      Fri 16 Oct",
      "  Repeats   Every year on 16 Oct",
      "  Reminder  Day before at 20:00",
    ]);
  });

  test("every 2 days after done", () => {
    const parsed = parseTask("run every 2 days after done", TODAY);
    expect(describeParsed(parsed, TODAY)).toEqual([
      "  Date     Today, Tue 13 Oct",
      "  Repeats  Every 2 days after done",
    ]);
  });

  test("a length and a deadline, never an invented length", () => {
    expect(describeParsed(parseTask("problem set for 45m due thu", TODAY), TODAY)).toEqual([
      "  Length  45m",
      "  Due     Thu 15 Oct",
    ]);
    expect(describeParsed(parseTask("dentist tomorrow 9am", TODAY), TODAY)).toEqual([
      "  Date  Tomorrow, Wed 14 Oct",
      "  Time  09:00",
    ]);
  });
});

describe("colour", () => {
  const now = Date.parse(f.NOW);

  test("only the space dot is coloured, with the token's colour", () => {
    const text = renderToday(f.today(), { color: true, now }, new RefBook());
    expect(spaceColor.blue.dot).toBe("#0093eb");
    expect(spaceColor.green.dot).toBe("#17a750");
    const blue = "\x1b[38;2;0;147;235m●\x1b[39m";
    const green = "\x1b[38;2;23;167;80m●\x1b[39m";
    expect(text).toContain(`\n  3  14:00–15:30  ${blue} Essay draft       School\n`);
    // A habit with no space keeps its place in the column.
    expect(text).toContain(
      `\nHabits\n  ${green} Read     1 of 5 this week\n    Stretch  2 of 3 this week  done today\n`,
    );
    // Every escape sequence is a dot: opened, one dot, closed.
    const escapes = text.match(/\x1b\[[0-9;]*m/g) ?? [];
    const dots = text.match(/\x1b\[38;2;\d+;\d+;\d+m●\x1b\[39m/g) ?? [];
    expect(escapes.length).toBe(dots.length * 2);
    expect(dots.length).toBe(9);
  });

  test("routines show their time, then how many parts are done or the streak", () => {
    const part = (index: number, title: string, length: number, done: boolean) => ({
      index,
      title,
      length,
      habitId: null,
      done,
    });
    const routine = {
      _id: "k97morning000000000000000000001",
      title: "Morning routine",
      color: null,
      spaceId: null,
      time: 420,
      length: 30,
      streak: 0,
      done: false,
      parts: [part(0, "Brush teeth", 5, true), part(1, "Meditate", 10, false), part(3, "Shower", 15, false)],
    };
    const night = { ...routine, title: "Night routine", time: 1320, length: 0, streak: 12, done: true };
    const text = renderToday(
      { ...f.today(), routines: [routine, night] },
      { color: false, now },
      new RefBook(),
    );
    expect(text).toContain(
      "\nRoutines\n  Morning routine  07:00–07:30  1 of 3 done\n  Night routine    22:00        done, 12 days in a row\n",
    );
  });

  test("without colour there are no escapes and no dots", () => {
    const text = renderToday(f.today(), { color: false, now }, new RefBook());
    expect(text).toContain("\n  3  14:00–15:30  Essay draft       School\n");
    expect(text).not.toMatch(/\x1b|●/);
  });
});
