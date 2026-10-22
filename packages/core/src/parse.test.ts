import { describe, expect, test } from "vitest";
import { parseTask } from "./parse.ts";

// Tuesday 13 October 2026.
const today = "2026-10-13";
const parse = (s: string) => {
  const { spans: _spans, ...rest } = parseTask(s, today);
  return rest;
};

describe("parseTask", () => {
  test("title, weekday, time, space, repeat and reminder in one sentence", () => {
    expect(parse("essay fri 5pm #school every week remind 1h before")).toEqual({
      title: "essay",
      spaceName: "school",
      date: "2026-10-16",
      time: 17 * 60,
      repeat: { freq: "week", interval: 1 },
      reminders: [{ kind: "before", minutes: 60 }],
    });
  });

  test("a class on Tuesdays and Thursdays with a length", () => {
    expect(parse("Calculus II lecture every tue and thu 9am for 1h30 until dec 11")).toEqual({
      title: "Calculus II lecture",
      date: "2026-10-13",
      time: 9 * 60,
      length: 90,
      repeat: { freq: "week", interval: 1, weekdays: [1, 3], end: { kind: "on", date: "2026-12-11" } },
      reminders: [],
    });
  });

  test("monthly rules: the 1st, the last day, the last Friday", () => {
    expect(parse("rent every month on the 1st remind day before at 20:00")).toEqual({
      title: "rent",
      date: "2026-11-01",
      repeat: { freq: "month", interval: 1, monthly: { kind: "day", day: 1 } },
      reminders: [{ kind: "day", offset: -1, time: 20 * 60 }],
    });
    expect(parse("send invoice every last day").repeat).toEqual({
      freq: "month",
      interval: 1,
      monthly: { kind: "last" },
    });
    expect(parse("send invoice every last day").date).toBe("2026-10-31");
    expect(parse("review every last fri").date).toBe("2026-10-30");
  });

  test("a birthday every year", () => {
    expect(parse("Mum's birthday 16 oct every year")).toEqual({
      title: "Mum's birthday",
      date: "2026-10-16",
      repeat: { freq: "year", interval: 1 },
      reminders: [],
    });
  });

  test("every 2 days after done", () => {
    expect(parse("run every 2 days after done")).toEqual({
      title: "run",
      date: "2026-10-13",
      repeat: { freq: "day", interval: 2, fromCompletion: true },
      reminders: [],
    });
  });

  test("a deadline is not a date", () => {
    expect(parse("problem set due thu")).toEqual({
      title: "problem set",
      deadline: "2026-10-15",
      reminders: [],
    });
  });

  test("a time range sets the time and the length", () => {
    expect(parse("standup tomorrow 9:30-9:45am")).toEqual({
      title: "standup",
      date: "2026-10-14",
      time: 570,
      length: 15,
      reminders: [],
    });
  });

  test("next friday is the Friday of next week; at 5 means the afternoon", () => {
    expect(parse("call next fri at 5")).toEqual({
      title: "call",
      date: "2026-10-23",
      time: 17 * 60,
      reminders: [],
    });
  });

  test("weekdays listed with spaces, and every other weekday", () => {
    expect(parse("yoga every mon wed fri 7am")).toEqual({
      title: "yoga",
      date: "2026-10-14",
      time: 7 * 60,
      repeat: { freq: "week", interval: 1, weekdays: [0, 2, 4] },
      reminders: [],
    });
    expect(parse("team sync every other mon 10:00 for 30m")).toEqual({
      title: "team sync",
      date: "2026-10-19",
      time: 10 * 60,
      length: 30,
      repeat: { freq: "week", interval: 2, weekdays: [0] },
      reminders: [],
    });
  });

  test("a phrase can end at a comma or a full stop", () => {
    expect(parse("Mum's birthday 16 oct every year, remind day before at 20:00")).toEqual({
      title: "Mum's birthday",
      date: "2026-10-16",
      repeat: { freq: "year", interval: 1 },
      reminders: [{ kind: "day", offset: -1, time: 20 * 60 }],
    });
    expect(parse("call the bank tomorrow.")).toEqual({
      title: "call the bank",
      date: "2026-10-14",
      reminders: [],
    });
    expect(parse("buy eggs, milk and bread").title).toBe("buy eggs, milk and bread");
  });

  test("a time on its own puts the task on today, as a reminder does", () => {
    expect(parse("call mum 5pm")).toEqual({
      title: "call mum",
      date: "2026-10-13",
      time: 17 * 60,
      reminders: [],
    });
    expect(parse("call mum fri 5pm").date).toBe("2026-10-16");
  });

  test("a range with am or pm only at the end starts on the same half of the day", () => {
    expect(parse("study 10-12pm")).toMatchObject({ title: "study", time: 10 * 60, length: 120 });
    expect(parse("lunch 11-1pm")).toMatchObject({ title: "lunch", time: 11 * 60, length: 120 });
    expect(parse("gym 6-7pm")).toMatchObject({ title: "gym", time: 18 * 60, length: 60 });
  });

  test("a date that doesn't exist stays in the title", () => {
    expect(parse("flight 2026-02-31")).toEqual({ title: "flight 2026-02-31", reminders: [] });
  });

  test("a plain sentence stays a plain title with no invented length", () => {
    expect(parse("buy oat milk")).toEqual({ title: "buy oat milk", reminders: [] });
  });

  test("nested spaces keep their path", () => {
    expect(parse("ship cli #work/kriyan").spaceName).toBe("work/kriyan");
  });

  test("spans point at each recognised phrase", () => {
    const input = "essay fri 5pm #school";
    const { spans } = parseTask(input, today);
    expect(spans.map((s) => [input.slice(s.start, s.end), s.kind])).toEqual([
      ["fri", "date"],
      ["5pm", "time"],
      ["#school", "space"],
    ]);
  });
  test("spans never run into a phrase taken earlier, so highlights don't overlap", () => {
    const input = "Calculus II lecture every tue and thu 9am for 1h30 #school/calculus";
    const { spans } = parseTask(input, today);
    expect(spans.map((s) => [input.slice(s.start, s.end), s.kind])).toEqual([
      ["every tue and thu", "repeat"],
      ["9am", "time"],
      ["for 1h30", "length"],
      ["#school/calculus", "space"],
    ]);
  });
});
