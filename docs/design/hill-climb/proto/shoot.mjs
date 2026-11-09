// Clicks through prototype.html the way a person would, at 390x844, checks each result and saves a
// screenshot per key moment into shots/.
//   node docs/design/hill-climb/proto/shoot.mjs
// Exits 1 with the failing step if anything doesn't do what it should.

import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shots = join(dir, "shots");
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
await page.goto(pathToFileURL(join(dir, "prototype.html")).href);
await page.evaluate(() => document.fonts.ready);

let n = 0;
const done = [];
let held = false;
const shot = async (name) => {
  // Park the pointer on the status bar unless a drag is in progress, so no row is caught with its hover tint.
  if (!held) await page.mouse.move(195, 8);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(260);
  const file = `${String(++n).padStart(2, "0")}-${name}.png`;
  await page.locator("#device").screenshot({ path: join(shots, file) });
  return file;
};
const text = (sel) => page.locator(sel).first().innerText();
const has = async (sel, want, step) => {
  const got = (await page.locator(sel).allInnerTexts()).join(" | ").replace(/\s+/g, " ");
  if (!got.includes(want)) throw new Error(`${step}: expected "${want}" in ${sel}, got "${got}"`);
};
const lacks = async (sel, want, step) => {
  const got = (await page.locator(sel).allInnerTexts()).join(" | ").replace(/\s+/g, " ");
  if (got.includes(want)) throw new Error(`${step}: did not expect "${want}" in ${sel}, got "${got}"`);
};
const act = (a) => page.locator(`#device [data-act="${a}"]`).first().click();
const dev = async (a) => { await page.locator(`.panel [data-act="${a}"]`).click(); await page.evaluate(() => scrollTo(0, 0)); };
const ok = (what, file) => { done.push(`${what} -> ${file}`); console.log(`ok  ${what} -> ${file}`); };
const clock = (m) => page.$eval("#scrub", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, m);
// Drag an element onto a point inside a free stretch; returns the time label the stretch showed.
const drag = async (fromSel, gapSel, frac, midShot) => {
  const a = await page.locator(fromSel).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  const g = await page.locator(gapSel).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height * frac, { steps: 8 });
  const label = await text(`${gapSel} .slot`);
  held = true;
  const file = midShot ? await shot(midShot) : null;
  held = false;
  await page.mouse.up();
  return { label, file };
};
// Drag a tray row or a placed line in the week onto a day; returns what the label under the finger said.
const dragToDay = async (fromSel, d, midShot) => {
  // The round buttons float over the bottom of the list, so bring the row clear of them first.
  await page.evaluate((sel) => {
    const sc = document.querySelector(".scroll");
    sc.scrollTop = 0;
    sc.scrollTop = Math.max(0, document.querySelector(sel).getBoundingClientRect().bottom - 700);
  }, fromSel);
  const a = await page.locator(fromSel).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 - 10, { steps: 3 });
  const g = await page.locator(`.wd[data-d="${d}"] .wdh`).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 8 });
  const label = await text(".ghost small");
  held = true;
  const file = midShot ? await shot(midShot) : null;
  held = false;
  await page.mouse.up();
  return { label, file };
};
const count = async (sel, want, step) => {
  const got = await page.locator(sel).count();
  if (got !== want) throw new Error(`${step}: expected ${want} of ${sel}, got ${got}`);
};
const is = (got, want, step) => { if (got !== want) throw new Error(`${step}: expected "${want}", got "${got}"`); };
const go = '.comp [data-act="add:go"]';

// Today, light and dark
await has(".card", "NEXT", "first screen");
await has(".card", "Time for Email TA", "first screen");
await has(".pile", "08:00 | 08:45 | 10:30".split(" | ")[1], "first screen");
if ((await page.locator(".pile .pr").count()) !== 3) throw new Error("first screen: To plan should show 3 rows");
ok("Today at 07:40, light: NEXT card, To plan with three suggested times", await shot("today-light"));
await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
ok("Today at 07:40, dark (follows prefers-color-scheme)", await shot("today-dark"));
await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

// Tap a suggested time, then Undo
await act("place:email");
await has(".tl", "Email TA", "tap suggested time");
await has(".tl", "08:00–08:10", "tap suggested time");
await has(".toast", "Placed at 08:00", "tap suggested time");
ok("Tap the suggested time 08:00: Email TA goes on the day, toast offers Undo", await shot("tap-suggested-time"));
await act("undo");
await lacks(".tl", "Email TA", "undo");
await has(".pile", "Email TA", "undo");
ok("Undo puts it back in To plan", await shot("undo"));

// Drag onto a free stretch, snapping to 15 minutes
let d = await drag('.pr[data-drag="lab1"] .pt', ".gap.now", 0.5, "drag-over-free-stretch");
const m = /^(\d\d):(\d\d)–/.exec(d.label);
if (!m || +m[2] % 15) throw new Error(`drag: slot "${d.label}" is not on a 15 minute step`);
ok(`Drag CSC 316 lab report over the free stretch: it shows ${d.label}`, d.file);
await has(".tl", d.label, "drag drop");
await has(".toast", `Placed at ${m[1]}:${m[2]}`, "drag drop");
ok(`Drop: placed at ${m[1]}:${m[2]}, snapped to 15 minutes`, await shot("drag-dropped"));

// Kriyan learns from a move
d = await drag('.pr[data-drag="prep1"] .pt', '.gap[data-s="765"]', 0.4);
await has(".pile", "You usually move study to after lunch", "learning");
ok(`Drag exam prep to after lunch (${d.label}): Kriyan says it learned, with Turn off`, await shot("learned-from-move"));
await act("learn:off");
await lacks("#view", "You usually move study", "learning off");
ok("Turn off removes the learned line", await shot("learning-off"));

// The item sheet: place, pick a time, move, not today, start, done
await dev("scene:0");
await act("open:item:prep1");
await has(".float", "Place at 08:45", "sheet");
await has(".float", "Start now", "sheet");
await has(".float", "Not today", "sheet");
ok("Tap a To plan row: sheet with Place at 08:45, Start now, Done, Pick a time, Not today", await shot("sheet-to-plan"));
await act("open:pick:prep1");
await has(".float", "Kriyan's suggestion", "picker");
await act("picktime:765");
await has(".float", "Place at 12:45", "picker");
ok("Pick a time: days, free times, 15 minute stepper", await shot("pick-a-time"));
await act("pickok");
await has(".toast", "Placed at 12:45", "picker confirm");
await has(".tl", "12:45–13:45", "picker confirm");
await act("open:item:prep1");
await has(".float", "Start", "placed sheet");
await has(".float", "Move", "placed sheet");
ok("Tap a block on the day: sheet with Start, Done, Move, Not today", await shot("sheet-on-the-day"));
await act("open:pick:prep1");
await act("pickstep:1");
await has(".float", "Move to 13:00", "move");
await act("pickok");
await has(".toast", "Moved to 13:00", "move");
await has(".tl", "13:00–14:00", "move");
ok("Move to a picked time: 12:45 to 13:00, block says where it came from", await shot("moved-to-picked-time"));
await act("open:item:prep1");
await act("nottoday:prep1");
await has(".toast", "Off today. Suggested Tue", "not today");
await lacks(".tl", "CSC 316 exam prep", "not today");
ok("Not today: off the day, with a suggested time tomorrow", await shot("not-today"));
await act("open:item:gym1");
await act("start:gym1");
await has(".card", "NOW", "start");
await has(".card", "Gym", "start");
ok("Start from the sheet: the card turns to NOW", await shot("started"));
await act("done:gym1");
await has(".toast", "Done: Gym", "done");
ok("Done: toast with Undo", await shot("done"));

// Place all at suggested times
await dev("scene:0");
await act("placeall");
await has(".toast", "Placed 3 at suggested times", "place all");
for (const t of ["08:00–08:10", "08:45–09:45", "10:30–12:00"]) await has(".tl", t, "place all");
ok("Place all 3: every suggestion lands at its time", await shot("place-all"));

// The top card through the day
await dev("scene:1");
await has(".card", "NOW", "08:50");
await has(".card", "until 09:45 · 5 min in", "08:50");
ok("08:50: NOW, in a session, Done and +15 min", await shot("card-now"));
await act("plus15:prep1");
await has(".card", "until 10:00", "+15");
await act("done:prep1");
await has(".toast", "Done: CSC 316 exam prep", "done from card");
ok("+15 min then Done on the card", await shot("card-after-done"));
await dev("scene:2");
await has(".card", "NOT STARTED", "10:45");
await has(".card", "set for 10:30", "10:45");
await has(".card", "Move to 12:45", "10:45");
ok("10:45: NOT STARTED with Start, Done already, Move to 12:45", await shot("card-not-started"));
await act("moveto:lab1:0:765");
await has(".tl", "12:45–14:15 · session 1 of 2 · from 10:30", "move later");
await has(".toast", "Moved to 12:45", "move later");
ok("Move to 12:45: one tap, nothing moved by itself", await shot("moved-later"));
await dev("scene:3");
await has(".card", "Time for CSC 316 lab report", "12:50");
await has(".card", "moved from 10:30", "12:50");
ok("12:50: the moved session comes round as NEXT", await shot("card-moved-session"));
await act("already:lab1");
await has(".toast", "Done: CSC 316 lab report", "done already");
ok("Done already: finished without a timer", await shot("done-already"));
await dev("scene:0");
await clock(730);
await has(".quiet", "Lunch until 12:45", "scrubber");
ok("Clock slider at 12:10: no card, one quiet line", await shot("quiet-line"));

// Add: a short sheet on the keyboard, one sentence, chips you can change, one button
await dev("scene:0");
await act("open:add");
is(await page.evaluate(() => document.activeElement.id), "addin", "add: the field has focus");
{
  const c = await page.locator(".comp").boundingBox(), k = await page.locator(".kb").boundingBox();
  if (!k || k.height < 240) throw new Error("add: the keyboard placeholder should be drawn");
  if (Math.abs(c.y + c.height - k.y) > 1) throw new Error(`add: the sheet should sit on the keyboard (sheet ends ${c.y + c.height}, keys start ${k.y})`);
  if (c.height > 360) throw new Error(`add: the empty sheet should be short, got ${c.height}px`);
}
await count('.comp [data-act^="add:ex:"]', 4, "add empty");
ok("Add, nothing typed: a short sheet on the keyboard, four examples to try", await shot("add-empty"));
await page.keyboard.press("Enter");
await has(".comp", "Type what you need to do first", "add empty");

await page.keyboard.type("Problem set 6 2h by fri");
is((await page.locator("#mir em").allInnerTexts()).join("|"), "2h|by fri", "add to-do: words in blue");
is((await page.locator('.comp [data-act^="add:edit:"]').allInnerTexts()).join("|"), "To-do|No space|2 h|Due Fri 13 Nov|Other times", "add to-do: chips");
const sugT = await text(".comp .ac.tm");
await has(go, "Add to To plan", "add to-do");
ok(`Typed "Problem set 6 2h by fri": parsed words in blue, chips for kind, space, length and due, suggested ${sugT}`, await shot("add-todo"));
await act("add:edit:space");
await has(".comp", "CSC 316", "add space options");
ok("Tap the space chip: the spaces to pick from", await shot("add-change-space"));
await act("add:set:space:ma");
is(await text('.comp [data-act="add:edit:space"]'), "MA 241", "add: space changed");
await page.keyboard.press("Enter");
await has(".toast", "Added to To plan", "add to plan");
await has(".pile", "Problem set 6", "add to plan");
await has(".pile", sugT, "add to plan");
await count(".comp", 0, "add to plan");
ok(`Enter adds it to To plan, where it waits with ${sugT}`, await shot("add-to-plan"));

await act("open:add");
await act("add:ex:0");
const sugT2 = await text(".comp .ac.tm");
await act("add:tog:0");
await has(go, `Place at ${sugT2}`, "add: time chosen");
ok(`Tap the suggested time: the button now says "Place at ${sugT2}"`, await shot("add-time-chosen"));
await act("add:edit:time");
const alts = await page.locator(".comp .ac.tm").allInnerTexts();
if (alts.length < 3) throw new Error(`add: expected other times to pick from, got ${alts.join(", ")}`);
ok(`Other times: ${alts.join(", ")}`, await shot("add-other-times"));
await page.locator(".comp .ac.tm").last().click();
await has(go, `Place at ${alts.at(-1)}`, "add: other time chosen");
await act("add:go");
await has(".toast", `Placed at ${alts.at(-1)}`, "add and place");
ok(`Pick ${alts.at(-1)} instead and add: placed there in one go`, await shot("add-placed"));

await act("open:add");
await act("add:ex:1");
is((await page.locator('.comp [data-act^="add:edit:"]').allInnerTexts()).join("|"), "Repeat|3 a week|Health|45 min", "add repeat: chips");
const gym = await page.locator(".comp .ac.tm").allInnerTexts();
is(String(gym.length), "3", "add repeat: three suggested times");
await has(go, "Add 3 to To plan", "add repeat");
ok(`"gym 45m 3 times a week": a repeat in Health with three suggested times, ${gym.join(", ")}`, await shot("add-repeat"));
await act("add:tog:0");
await has(go, "Place 1, add 2 to To plan", "add repeat: one chosen");
await act("add:tog:1");
await act("add:tog:2");
await has(go, "Place all 3", "add repeat: all chosen");
ok("Tap all three times: the button says Place all 3", await shot("add-repeat-place-all"));
await act("add:go");
await has(".toast", "Placed 3 at suggested times", "add repeat");
await act("nav:week");
for (const g of gym) await has(`.wd[data-d="${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(g.slice(0, 3))}"]`, `${g.slice(4)} Gym`, "add repeat: on the week");
await act("day:0");

await act("open:add");
await act("add:ex:2");
is((await page.locator("#mir em").allInnerTexts()).join("|"), "nov 23|9am|prep 5h", "add exam: words in blue");
is((await page.locator('.comp [data-act^="add:edit:"]').allInnerTexts()).join("|"), "Event|CSC 316|No length|Mon 23 Nov, 09:00|Prep 5 h", "add exam: chips");
const prep = await page.locator(".comp .ac.tm").allInnerTexts();
is(String(prep.length), "5", "add exam: five prep sessions");
await has(go, "Add with 5 prep sessions", "add exam");
ok(`"csc 316 exam nov 23 9am prep 5h": an event fixed at Mon 23 Nov, 09:00, and 5 prep sessions suggested for ${prep.join("; ")}`, await shot("add-exam-prep"));
await act("add:go");
await has(".toast", "Added for Mon 23 Nov. 5 prep sessions in To plan", "add exam");
await has(".pile", "New · 1 h · session 1 of 5", "add exam: prep in To plan");
await lacks(".tl", "CSC 316 exam", "add exam: nothing placed by itself");
ok("Add: the exam is fixed at its time; the prep sessions wait in To plan", await shot("add-exam-added"));

await act("open:add");
await act("add:ex:3");
is((await page.locator('.comp [data-act^="add:set:len:"]').allInnerTexts()).join("|"), "10 min|30 min|1 h|2 h", "add no length: length chips");
await count(".comp .ac.tm", 0, "add no length: no time is suggested");
await has(go, "Add to To plan", "add no length");
ok('"buy stamps": no length typed, so it offers 10 min, 30 min, 1 h, 2 h and guesses nothing', await shot("add-no-length"));
await act("add:set:len:30");
is(await text('.comp [data-act="add:edit:len"]'), "30 min", "add: length picked");
await count(".comp .ac.tm", 1, "add: a length brings a suggested time");
ok(`Pick 30 min: now there is a suggested time, ${await text(".comp .ac.tm")}`, await shot("add-length-picked"));
await page.keyboard.press("Enter");
await has(".toast", "Added to To plan", "add no length");

await act("open:add");
await act("add:ex:0");
await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
ok("Add in dark", await shot("add-dark"));
await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
await page.keyboard.press("Escape");
await count(".comp", 0, "add: Escape closes it");

// New work arriving
await dev("scene:0");
await dev("sim:moodle");
await has(".toast", "New from Moodle: MA 241 problem set 5, 2 h, due Fri", "moodle");
await has(".pile", "MA 241 problem set 5", "moodle");
await lacks(".tl", "MA 241 problem set 5", "moodle");
ok("Simulate new Moodle work: it arrives in To plan with a suggested time, not on a day", await shot("new-moodle-work"));
const placeLabel = await text(".toast button");
await page.locator(".toast button").click();
await has(".toast", "Placed at Tue", "moodle place");
ok(`One tap on "${placeLabel}" places it`, await shot("moodle-placed"));

// Clear today
await dev("scene:0");
await act("place:email");
await act("open:daymenu");
await has(".float", "Clear today", "day menu");
ok("Tap the day name: day menu", await shot("day-menu"));
await act("open:clear");
await has(".full", "Move all 4", "clear");
ok("Clear today: each thing with a suggested new time", await shot("clear-today"));
await page.locator('.full [data-act^="clear:one:email"]').click();
await has(".full", "Moved to Tue 08:00", "clear one");
await has(".full", "Move the other 3", "clear one");
ok("Move one by one: Email TA to Tue 08:00", await shot("clear-one"));
await act("clear:pick:gym1");
await has(".float", "Gym", "clear pick");
ok("Open a row to pick another time", await shot("clear-pick"));
await act("pickok");
await has(".full", "Move the other 2", "clear pick back");
await act("clear:all");
await has(".toast", "Cleared today", "clear all");
await lacks(".tl", "Gym", "clear all");
if (await page.locator(".pile .pr").count() > 1) throw new Error("clear all: To plan should only keep Buy stamps");
ok("Move the rest: today is clear, toast with Undo", await shot("cleared"));

// Week: see how full each day is, and plan it
await dev("scene:0");
await act("nav:week");
await has(".wkt", "This week", "week");
await count(".wd", 7, "week: a row for each day");
await count(".wbar .bit.sg", 8, "week: suggestions in blue on the days");
await count(".wbar .bit.pl", 1, "week: what is placed");
await count(".pile .pr", 9, "week tray");
await has(".pile", "Place all 8", "week tray");
await has(".pile", "drag a row onto a day", "week tray");
await lacks("#view", "coursework", "week: no limit maths");
ok("Week: seven day strips (grey fixed, black placed, blue suggested) and To plan this week", await shot("week"));
await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
ok("Week in dark", await shot("week-dark"));
await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

await act("place:lab2");
await has('.wd[data-d="1"]', "08:30 CSC 316 lab report", "week: tap a time");
await has(".toast", "Placed at Tue 08:30", "week: tap a time");
await count(".pile .pr", 8, "week: tap a time");
await count('.wd[data-d="1"] .bit.pl', 1, "week: tap a time");
ok("Tap Tue 08:30 in the tray: the lab report lands on Tuesday", await shot("week-tap-time"));

d = await dragToDay('.pr[data-drag="prep2"] .pt', 3, "week-drag-over-day");
is(d.label, "Thu 09:00–10:00", "week: drag over a day");
ok(`Drag exam prep from the tray over Thursday: the label says ${d.label}`, d.file);
await has('.wd[data-d="3"]', "09:00 CSC 316 exam prep", "week: drop on a day");
await has(".toast", "Placed at Thu 09:00", "week: drop on a day");
ok("Drop: placed on Thursday at 09:00", await shot("week-drag-dropped"));
await act("undo");
await lacks('.wd[data-d="3"]', "CSC 316 exam prep", "week: undo");
await has(".pile", "Wed 09:00", "week: undo");

await act("placeweek");
await has(".toast", "Placed 7 at suggested times", "week: place all");
await count(".pile .pr", 1, "week: place all");
await has(".pile", "Buy stamps", "week: place all");
await count(".wbar .bit.sg", 0, "week: place all");
await page.evaluate(() => { document.querySelector(".scroll").scrollTop = 0; });
ok("Place all 7: the week is planned; Buy stamps waits because it has no length", await shot("week-place-all"));

d = await dragToDay('.wl[data-drag="lab2"]', 0);
is(d.label, "Mon 12:45–14:15", "week: drag a placed line to another day");
await has(".toast", "Moved to Mon 12:45", "week: move between days");
await has('.wd[data-d="0"]', "12:45 CSC 316 lab report", "week: move between days");
await lacks('.wd[data-d="1"]', "lab report", "week: move between days");
await has('.wd[data-d="0"] .wn', "Full", "week: a full day is marked");
ok("Drag the lab report from Tuesday to Monday: it moves to 12:45, and Monday is marked Full", await shot("week-move-day"));

await page.locator('.wl[data-drag="gym2"]').click();
await act("open:pick:gym2");
await act("pickday:3");
await has(".float", "Move to Thu 16:00", "week: move with the sheet");
ok("Or tap a line, Move, pick Thu: same time, another day", await shot("week-move-sheet"));
await act("pickok");
await has(".toast", "Moved to Thu 16:00", "week: move with the sheet");
await has('.wd[data-d="3"]', "16:00 Gym", "week: move with the sheet");

await page.locator('.wd[data-d="2"] .wdh').click();
await has(".dayb", "Wed", "week: open a day");
await has(".tl", "09:00–10:00 · session 2 of 5", "week: open a day");
await has(".fabs", "Week", "week: open a day");
ok("Tap Wednesday: the Today screen for that date, with a way back to the week", await shot("week-open-day"));
await act("nav:week");
await has(".wkt", "This week", "back to the week");
await act("day:0");
await has(".dayb", "Mon", "back to today");

// Goals (the week above is planned by now, so start the day again)
await dev("scene:0");
await act("open:menu");
ok("Menu", await shot("menu"));
await act("nav:goals");
await has(".page", "Weigh 72 kg", "goals");
await has(".page", "Fed by Gym, 3 a week", "goals");
ok("Goals: each says what feeds it", await shot("goals"));
await act("goal:new");
await act("goal:ex:0");
await act("goal:save");
await has(".page", "WHAT GETS YOU THERE?", "goal ask");
await has(".page", "by Thu 31 Dec", "goal ask");
ok('New goal "Read 3 books by 31 Dec" asks: What gets you there?', await shot("goal-what-gets-you-there"));
await act("goal:add:g1");
await has(".page", "Fed by Read 40 min, 5 evenings a week", "goal fed");
ok("Add this repeat: the goal now says what feeds it", await shot("goal-fed"));
await act("nav:today");
await has(".pile", "Read", "goal repeat in plan");

// Settings
await act("open:menu");
await act("nav:settings");
ok("Settings: daily coursework maximum, preferred times, look", await shot("settings"));
await act("max:1");
await has(".step", "4 h 30", "max");
await act("pref:evening");
await act("pref:morning");
await act("theme:dark");
if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") throw new Error("dark toggle did not set the theme");
ok("Maximum to 4 h 30, evenings on, mornings off, dark mode on", await shot("settings-dark"));
await act("nav:today");
await has(".pile", "12:45", "prefs change suggestions");
ok("Today in dark from the toggle; study suggestions now start after lunch", await shot("today-dark-toggle"));
await act("open:menu");
await act("nav:settings");
await act("theme:system");
await act("nav:today");

// Lock screen
await dev("scene:0");
await dev("lock:toggle");
await has(".lock", "Time for Email TA", "lock next");
ok("Lock screen: the live card, NEXT", await shot("lock-next"));
await dev("scene:1");
await has(".lock", "NOW", "lock now");
ok("Lock screen at 08:50: NOW with Done and +15 min", await shot("lock-now"));
await page.locator('.lock [data-act="done:prep1"]').click();
await has(".toast", "Done: CSC 316 exam prep", "lock done");
ok("Done on the lock screen works without opening the app", await shot("lock-done"));
await dev("scene:2");
await has(".lock", "NOT STARTED", "lock late");
ok("Lock screen at 10:45: NOT STARTED with its three buttons", await shot("lock-not-started"));
await dev("lock:toggle");

// Free stretch and event sheets
await dev("scene:0");
await page.locator('.gap[data-s="765"]').click();
await has(".float", "Pick what goes here", "gap sheet");
ok("Tap a free stretch: pick what goes there", await shot("free-stretch-sheet"));
await page.locator('.float [data-act^="gapplace:email"]').click();
await has(".tl", "12:45–12:55", "gap place");
await act("open:ev:ma");
await has(".float", "Skip once", "event sheet");
ok("Tap a class: Skip once", await shot("event-sheet"));
await act("skip:ma");
await lacks(".tl", "MA 241 lecture", "skip");

// Keyboard: focus ring, Escape closes a sheet
await dev("scene:0");
await page.keyboard.press("Tab");
for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
ok("Keyboard focus ring on Today", await shot("focus-ring"));
await act("open:item:email");
await page.keyboard.press("Escape");
if (await page.locator(".float").count()) throw new Error("Escape did not close the sheet");

await browser.close();
if (errors.length) { console.error("page errors:\n" + errors.join("\n")); process.exit(1); }
console.log(`\n${done.length} checks passed, ${n} screenshots in ${shots}`);
