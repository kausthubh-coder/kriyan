// Runs the Critly check on the signed-in app: every screen at 390 and 1440, plus the open
// states (task panel, repeat editor, command menu, quick add), and the sign-in screen signed
// out. Uses the saved sign-in from seed.mjs. `bun run lint:ui` runs this.
//   node apps/app/e2e/critly-signed-in.mjs        (exit 1 on any finding, 2 if it couldn't run)

import { existsSync, readFileSync } from "node:fs";
import { expectCritly } from "@kausthubh/critly/playwright";
import { op } from "./api.mjs";
import { artifact, BASE, launch, settle, signedInContext } from "./lib.mjs";

process.chdir(new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

const screens = [
  { name: "today", go: (p) => p.goto(`${BASE}/`) },
  { name: "review", go: (p) => p.goto(`${BASE}/review`) },
  { name: "upcoming", go: (p) => p.goto(`${BASE}/upcoming`) },
  { name: "inbox", go: (p) => p.goto(`${BASE}/inbox`) },
  { name: "menu", go: (p) => p.goto(`${BASE}/menu`) },
  { name: "goals", go: (p) => p.goto(`${BASE}/goals`) },
  { name: "agents", go: (p) => p.goto(`${BASE}/agents`) },
  { name: "settings", go: (p) => p.goto(`${BASE}/settings`) },
  { name: "recently deleted", go: (p) => p.goto(`${BASE}/trash`) },
  {
    name: "space",
    go: async (p) => {
      await p.goto(`${BASE}/menu`);
      await settle(p);
      await p
        .getByRole("link", { name: /^Kriyan(, \d+)?$/ })
        .last()
        .click();
      await p.waitForURL(/\/space\//);
    },
  },
  {
    // Phones open Joi's floating card on its own route; desktop shows it in Today's right panel.
    name: "task sheet",
    go: async (p) => {
      await openTask(p);
    },
  },
  {
    name: "edit and its repeat picker",
    go: async (p) => {
      await openTask(p);
      await p.getByRole("button", { name: "Edit", exact: true }).click();
      await p.getByRole("button", { name: /^Repeat/ }).click();
    },
  },
  {
    name: "routine sheet",
    go: async (p) => {
      await p.goto(`${BASE}/`);
      await settle(p);
      await p
        .getByRole("button", { name: /^Open Morning routine/ })
        .first()
        .click();
    },
  },
  {
    name: "fill",
    go: async (p) => {
      await p.goto(`${BASE}/`);
      await settle(p);
      await p
        .getByRole("button", { name: /free\. Fill/ })
        .first()
        .click();
      await p.getByRole("radio").first().click();
    },
  },
  {
    name: "summary",
    go: async (p) => {
      await p.goto(`${BASE}/`);
      await settle(p);
      await p.getByRole("button", { name: "Show the summary" }).click();
    },
  },
  {
    name: "month",
    go: async (p) => {
      await p.goto(`${BASE}/`);
      await settle(p);
      // Phones have the Month button; desktop shows the month in the right panel already.
      if ((p.viewportSize()?.width ?? 0) < 760) await p.getByRole("button", { name: "Month" }).click();
    },
  },
  {
    name: "today as a list",
    go: async (p) => {
      await op("update_settings", { todayLayout: "list" });
      await p.goto(`${BASE}/`);
      await settle(p);
      await p.getByLabel("Today's list").filter({ visible: true }).first().waitFor();
    },
    after: () => op("update_settings", { todayLayout: "blocks" }),
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

async function openTask(p) {
  await p.goto(`${BASE}/`);
  await settle(p);
  await p
    .getByRole("button", { name: /^Open Write MCP tools/ })
    .first()
    .click();
  if ((p.viewportSize()?.width ?? 0) < 760) await p.waitForURL(/\/task\//);
  else await p.getByRole("complementary", { name: "Details" }).waitFor();
}

const policy = JSON.parse(readFileSync(".critly/policy.json", "utf8"));
delete policy.$schema;

async function focusPass(page, viewport) {
  const findings = [];
  const count = await page.evaluate(
    ([p, c]) => window.__critlyCheck.focusStart(p, c),
    [policy, { viewport: `${viewport.width}x${viewport.height}`, scheme: "dark" }],
  );
  for (let i = 0; i < Math.min(count + 1, 80); i++) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate(() => window.__critlyCheck.focusStep());
    if (step.done) break;
    if (step.finding) findings.push(step.finding);
  }
  return findings;
}

if (!existsSync(artifact("auth-state.json"))) {
  console.error(
    "No saved sign-in: run `node apps/app/e2e/seed.mjs` first. critly signed in: could not run · exit 2",
  );
  process.exit(2);
}
// A crash (the app down, a screen that never loads) is "couldn't run", not a finding.
process.on("uncaughtException", (error) => {
  console.error(`critly signed in: could not run: ${error.message} · exit 2`);
  process.exit(2);
});
process.on("unhandledRejection", (error) => {
  console.error(
    `critly signed in: could not run: ${error instanceof Error ? error.message : error} · exit 2`,
  );
  process.exit(2);
});

const browser = await launch();
let failures = 0;
let checks = 0;
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  // The sign-in screen, signed out.
  const out = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const signInPage = await out.newPage();
  signInPage.setDefaultTimeout(60000);
  await signInPage.goto(`${BASE}/sign-in`);
  await settle(signInPage);
  checks++;
  try {
    await expectCritly(signInPage, undefined, { scheme: "dark" });
    const focus = await focusPass(signInPage, viewport);
    if (focus.length)
      throw new Error(focus.map((f) => `✕ focus-ring\n  where ${f.where}\n  actual ${f.actual}`).join("\n"));
    console.log(`ok   sign-in ${viewport.width}`);
  } catch (error) {
    failures++;
    console.log(`FAIL sign-in ${viewport.width}\n${String(error.message).split("Fix the UI")[0]}`);
  }
  await out.close();

  const ctx = await signedInContext(browser, viewport);
  for (const screen of screens) {
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    try {
      await screen.go(page);
    } catch (error) {
      // Put back whatever the state changed (the list layout) before giving up.
      await screen.after?.();
      throw error;
    }
    await settle(page);
    checks++;
    try {
      await expectCritly(page, undefined, { scheme: "dark" });
      const focus = await focusPass(page, viewport);
      if (focus.length)
        throw new Error(
          focus.map((f) => `✕ focus-ring\n  where ${f.where}\n  actual ${f.actual}`).join("\n"),
        );
      console.log(`ok   ${screen.name} ${viewport.width}`);
    } catch (error) {
      failures++;
      console.log(`FAIL ${screen.name} ${viewport.width}\n${String(error.message).split("Fix the UI")[0]}`);
    }
    await screen.after?.();
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`critly signed in: ${failures} failing of ${checks} checks · exit ${failures ? 1 : 0}`);
process.exit(failures ? 1 : 0);
