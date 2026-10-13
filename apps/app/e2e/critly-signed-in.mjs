// Runs the Critly check on the signed-in app: every screen at 390 and 1440, plus the open
// states (task panel, repeat editor, command menu, quick add). Signs in first.
//   node apps/app/e2e/critly-signed-in.mjs        (exit 1 on any finding)

import { readFileSync } from "node:fs";
import { expectCritly } from "@kausthubh/critly/playwright";
import { BASE, launch, settle, signedInContext } from "./lib.mjs";

process.chdir(new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

const screens = [
  { name: "today", go: (p) => p.goto(`${BASE}/today`) },
  { name: "upcoming", go: (p) => p.goto(`${BASE}/upcoming`) },
  { name: "inbox", go: (p) => p.goto(`${BASE}/inbox`) },
  { name: "browse", go: (p) => p.goto(`${BASE}/browse`) },
  { name: "progress", go: (p) => p.goto(`${BASE}/progress`) },
  { name: "settings", go: (p) => p.goto(`${BASE}/settings`) },
  {
    name: "space",
    go: async (p) => {
      await p.goto(`${BASE}/browse`);
      await settle(p);
      await p.getByRole("link", { name: "Kriyan", exact: true }).last().click();
      await p.waitForURL(/\/space\//);
    },
  },
  {
    name: "task panel",
    go: async (p) => {
      await p.goto(`${BASE}/today`);
      await settle(p);
      await p.getByRole("button", { name: /^Open Run/ }).first().click();
      await p.waitForURL(/\/task\//);
    },
  },
  {
    name: "repeat editor",
    go: async (p) => {
      await p.goto(`${BASE}/today`);
      await settle(p);
      await p.getByRole("button", { name: /^Open Run/ }).first().click();
      await p.waitForURL(/\/task\//);
      await settle(p);
      await p.getByRole("button", { name: /^Repeat:/ }).click();
    },
  },
  {
    name: "command menu",
    go: async (p) => {
      await p.goto(`${BASE}/today`);
      await settle(p);
      await p.keyboard.press("Control+k");
      await p.getByRole("textbox", { name: "Search or type a task" }).fill("call mum fri 6pm #life");
    },
  },
  {
    name: "quick add",
    go: async (p) => {
      await p.goto(`${BASE}/today`);
      await settle(p);
      await p.goto(`${BASE}/add`);
    },
  },
];

const policy = JSON.parse(readFileSync(".critly/policy.json", "utf8"));
delete policy.$schema;

async function focusPass(page, viewport) {
  const findings = [];
  const count = await page.evaluate(([p, c]) => window.__critlyCheck.focusStart(p, c), [policy, { viewport: `${viewport.width}x${viewport.height}`, scheme: "dark" }]);
  for (let i = 0; i < Math.min(count + 1, 80); i++) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate(() => window.__critlyCheck.focusStep());
    if (step.done) break;
    if (step.finding) findings.push(step.finding);
  }
  return findings;
}

const browser = await launch();
let failures = 0;
let checks = 0;
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  const ctx = await signedInContext(browser, viewport);
  for (const screen of screens) {
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await screen.go(page);
    await settle(page);
    checks++;
    try {
      await expectCritly(page, undefined, { scheme: "dark" });
      const focus = await focusPass(page, viewport);
      if (focus.length) throw new Error(focus.map((f) => `✕ focus-ring\n  where ${f.where}\n  actual ${f.actual}`).join("\n"));
      console.log(`ok   ${screen.name} ${viewport.width}`);
    } catch (error) {
      failures++;
      console.log(`FAIL ${screen.name} ${viewport.width}\n${String(error.message).split("Fix the UI")[0]}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`critly signed in: ${failures} failing of ${checks} checks · exit ${failures ? 1 : 0}`);
process.exit(failures ? 1 : 0);
