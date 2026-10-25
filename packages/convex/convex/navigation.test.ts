/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const webPushMock = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webPushMock }));

const modules = import.meta.glob("./**/*.ts");
const ALICE = {
  tokenIdentifier: "https://clerk.test|user_alice",
  subject: "user_alice",
  issuer: "https://clerk.test",
};
const BOB = {
  tokenIdentifier: "https://clerk.test|user_bob",
  subject: "user_bob",
  issuer: "https://clerk.test",
};
// Tuesday 13 October 2026.
const TODAY = "2026-10-13";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  await alice.mutation(api.account.ensureProfile, { timeZone: "UTC" });
  const school = await alice.mutation(api.organize.addSpace, { name: "School", color: "green" });
  const calculus = await alice.mutation(api.organize.addSpace, {
    name: "Calculus",
    color: "purple",
    parentId: school,
  });
  const life = await alice.mutation(api.organize.addSpace, { name: "Life", color: "orange" });
  return { t, alice, school, calculus, life };
}

describe("navigation counts", () => {
  test("a space counts its own open tasks and those of the spaces inside it, not events", async () => {
    const { alice, school, calculus, life } = await setup();
    await alice.mutation(api.tasks.addText, { text: "Problem set 4 due fri", spaceId: calculus });
    await alice.mutation(api.tasks.addText, { text: "Read 7.4 today", spaceId: calculus });
    await alice.mutation(api.tasks.addText, { text: "Buy a planner", spaceId: school });
    await alice.mutation(api.tasks.add, {
      title: "Calculus lecture",
      spaceId: calculus,
      date: TODAY,
      time: 540,
      length: 90,
      event: true,
    });
    const done = await alice.mutation(api.tasks.addText, { text: "Old quiz today", spaceId: calculus });
    await alice.mutation(api.tasks.complete, { id: done });
    const counts = await alice.query(api.navigation.counts, {});
    expect(counts).toEqual([
      { spaceId: school, open: 3 },
      { spaceId: calculus, open: 2 },
      { spaceId: life, open: 0 },
    ]);
  });

  test("another person's spaces and tasks never show", async () => {
    const { t, calculus } = await setup();
    const bob = t.withIdentity(BOB);
    await bob.mutation(api.account.ensureProfile, { timeZone: "UTC" });
    expect(await bob.query(api.navigation.counts, {})).toEqual([]);
    await expect(bob.query(api.navigation.spaceDays, { id: calculus, today: TODAY })).rejects.toThrow(
      "That space doesn't exist or isn't yours.",
    );
  });
});

describe("a space by day", () => {
  test("lists each day's planned tasks, repeats on each day, and due dates with no day planned", async () => {
    const { alice, school, calculus } = await setup();
    await alice.mutation(api.tasks.addText, {
      text: "Calculus II lecture every tue and thu 9am for 1h30",
      spaceId: calculus,
    });
    await alice.mutation(api.tasks.addText, { text: "Problem set 4 due fri 23:59", spaceId: calculus });
    await alice.mutation(api.tasks.addText, { text: "Essay tomorrow due fri", spaceId: school });
    await alice.mutation(api.tasks.addText, { text: "Someday reading", spaceId: school });
    const days = await alice.query(api.navigation.spaceDays, { id: school, today: TODAY });
    expect(days.slice(0, 4).map((d) => [d.date, d.items.map((t) => [t.title, t.dueOnly])])).toEqual([
      ["2026-10-13", [["Calculus II lecture", false]]],
      ["2026-10-14", [["Essay", false]]],
      ["2026-10-15", [["Calculus II lecture", false]]],
      ["2026-10-16", [["Problem set 4", true]]],
    ]);
    // Three weeks of Tuesdays and Thursdays, plus the essay and the problem set.
    expect(days.length).toBe(8);
  });
});
