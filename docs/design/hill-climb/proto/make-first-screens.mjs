// Builds first-screens.html (two options for Today, side by side) from prototype.html's own CSS and
// icons, so the comparison uses the same look as the prototype, then screenshots it.
//   node docs/design/hill-climb/proto/make-first-screens.mjs
// Writes first-screens.html and first-screens.png next to this file.

import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const proto = readFileSync(join(dir, "prototype.html"), "utf8");
const css = proto.match(/<style>([\s\S]*?)<\/style>/)[1];
const sprite = proto.match(/<svg id="sprite"[\s\S]*?<\/svg>/)[0];

const I = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const status = `<div class="sb"><span>07:40</span><svg width="44" height="12" viewBox="0 0 44 12" fill="currentColor" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/><rect x="24" y="1" width="18" height="10" rx="3"/></svg></div>`;
const head = `<header class="top"><button class="dayb">Mon<span class="dot"></span>${I("down")}</button><div class="date">9 November<br>2026</div></header>
<nav class="strip">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<button class="${i === 0 ? "on td" : ""}"><b>${9 + i}</b><span>${d}</span></button>`).join("")}</nav>`;
const card = `<section class="card one"><div class="txt"><div class="lab"><span class="tag">Next</span>Free until 12:00</div><h2>Time for Email TA</h2></div><button class="cb pri">Start</button></section>`;
const fabs = `<div class="fabs"><button class="fab" aria-label="Menu">${I("menu")}</button><button class="fab add" aria-label="Add">${I("plus")}</button><button class="fab" aria-label="Week">${I("week")}</button></div>`;

const ev = (time, title, meta, tone, h = 64) =>
  `<div class="r"><div class="tt">${time}</div><div class="blk s-${tone}" style="min-height:${h}px"><span class="lead">${I("clock")}</span><button class="body"><span class="ti">${title}</span><span class="me">${meta}</span></button></div></div>`;
const todo = (time, title, meta, tone, h = 64) =>
  `<div class="r"><div class="tt">${time}</div><div class="blk s-${tone}" style="min-height:${h}px"><button class="chk" aria-label="Mark done"><i>${I("check")}</i></button><button class="body"><span class="ti">${title}</span><span class="me">${meta}</span></button></div></div>`;
const gap = (label, h = 44, now = false) =>
  `<div class="r"><div class="tt"></div><button class="gap${now ? " now" : ""}" style="min-height:${h}px"><span>${label}</span></button></div>`;
const sg = (time, title, meta, h = 64) =>
  `<div class="r"><div class="tt">${time}</div><div class="blk sg" style="min-height:${h}px"><button class="body"><span class="ti">${title}</span><span class="me">${meta}</span></button><button class="keep" aria-label="Keep ${title} at ${time}"><i>${I("check")}</i></button></div></div>`;
const row = (title, sub, chip) =>
  `<div class="pr"><button class="chk" aria-label="Mark done"><i>${I("check")}</i></button><button class="pt"><span>${title}</span><small>${sub}</small></button><button class="sug${chip === "Pick a time" ? " none" : ""}">${chip}</button></div>`;

const A = `${status}<div class="scroll">${head}${card}
<div class="quiet a-hint"><span>3 suggested times on your day. Tick one to keep it, or drag it.</span><button class="lnk">Keep all 3</button></div>
<div class="tl">
${sg("08:00", "Email TA", "08:00–08:10 · suggested")}
${sg("08:45", "CSC 316 exam prep", "08:45–09:45 · session 1 of 5")}
${sg("10:30", "CSC 316 lab report", "10:30–12:00 · session 1 of 2", 94)}
${ev("12:00", "Lunch", "12:00–12:45", "pink")}
${gap("1 h 45 free", 52)}
${ev("14:30", "MA 241 lecture", "14:30–15:45", "purple", 78)}
${todo("16:00", "Gym", "16:00–16:45 · 1 of 3 this week", "green")}
</div><div class="end"></div></div>${fabs}`;

const B = `${status}<div class="scroll">${head}${card}
<section class="pile"><div class="hd">To plan<span>Tap a time, or hold and drag</span></div>
${row("Email TA", "10 min", "08:00")}
${row("CSC 316 exam prep", "1 h · session 1 of 5 · exam Mon 23 Nov", "08:45")}
${row("CSC 316 lab report", "1 h 30 · session 1 of 2 · due Wed", "10:30")}
<div class="ft"><button class="lnk more">1 more</button><button class="lnk">Place all 3</button></div></section>
<div class="tl">
${gap("Now, 4 h 20 free until 12:00", 112, true)}
${ev("12:00", "Lunch", "12:00–12:45", "pink")}
${gap("1 h 45 free", 52)}
${ev("14:30", "MA 241 lecture", "14:30–15:45", "purple", 78)}
${todo("16:00", "Gym", "16:00–16:45 · 1 of 3 this week", "green")}
</div><div class="end"></div></div>${fabs}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kriyan Today: two first screens</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}
/* Only for this comparison page */
.cmp{display:grid;grid-template-columns:repeat(2,390px);gap:64px;justify-content:center;padding:48px 24px}
.opt{display:flex;flex-direction:column;gap:24px}
.opt .device{order:0}
.opt .cap{display:flex;flex-direction:column;gap:4px;min-height:112px}
.opt h1{font-size:20px;line-height:24px;font-weight:600;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px}
.opt p{font-size:14px;line-height:20px;color:var(--ink2);text-wrap:pretty}
.pick{font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:4px 8px;border-radius:8px;background:var(--ink);color:var(--on-ink)}
.why{grid-column:1 / -1;max-width:640px;justify-self:center;font-size:14px;line-height:20px;color:var(--ink2);text-wrap:pretty}
.why b{color:var(--ink);font-weight:600}
/* Option A only: a suggestion drawn on the day, dashed until you keep it */
.blk.sg{background:transparent;border:1.5px dashed var(--parse)}
.blk.sg .body{padding:12px 0 12px 16px}
.keep{width:48px;flex:none;display:grid;place-items:center}
.keep i{width:32px;height:32px;border-radius:50%;background:var(--parse);color:var(--on-ink);display:grid;place-items:center}
.a-hint{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px 0 32px}
.lnk.more{color:var(--ink2);font-weight:500}
@media (max-width:900px){.cmp{grid-template-columns:390px}.why{grid-column:1}}
</style></head><body>
${sprite}
<main class="cmp">
  <div class="opt" id="a"><div class="cap"><h1>A · Suggestions sit on the day</h1><p>Kriyan draws each suggestion as a dashed block at its time. Tick it to keep it there, drag it somewhere else, or open it to say not today.</p></div><div class="device">${A}</div></div>
  <div class="opt" id="b"><div class="cap"><h1>B · To plan, with suggested times <span class="pick">Picked</span></h1><p>The day holds only what you put on it. Each thing to plan offers a time: tap it to place it there, drag the row onto any free stretch, or open the row to pick another time.</p></div><div class="device">${B}</div></div>
  <p class="why"><b>Why B.</b> A block on the day always means you put it there, so the day never looks planned for you, which is the thing you ruled out. One list holds everything without a time: today's suggestions, new work suggested for another day, and things with no length yet. A needs a second strip for those. The same row and blue time is reused by Clear today and by new Moodle work, so there is one gesture to learn. What B costs is height: the day starts lower until the list empties, and A shows the shape of the morning sooner.</p>
</main>
</body></html>
`;
writeFileSync(join(dir, "first-screens.html"), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1160 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(dir, "first-screens.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(dir, "first-screens.png"), fullPage: true });
await browser.close();
console.log("wrote first-screens.html and first-screens.png");
