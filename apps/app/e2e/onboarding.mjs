// Onboarding the way a new person meets it. Signed out at 390 and 1440, light and dark: the app
// opens on the welcome, then help, day shape, the math, the first thing (with highlighting), and
// "Save your plan". Then once, as a brand-new Clerk test user: sign up from step 6, land back in
// onboarding, see the plan saved (profile hours, the first task), and finish on Today.
//   node apps/app/e2e/onboarding.mjs            (SIGNED_IN=0 skips the new-user run)
// Screenshots: .artifacts/app/onb-<step>-<width>-<scheme>.png

import { BASE, artifact, launch, settle } from "./lib.mjs";

const browser = await launch();
const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
};

async function throughSteps(page, shot) {
  await page.goto(`${BASE}/today`);
  await settle(page);
  check("signed out, the app opens on the welcome", /\/welcome/.test(page.url()));
  await page.getByText("Your whole day,").waitFor();
  await shot("1-welcome");
  await page.getByRole("button", { name: "Plan my first day" }).click();

  await page.getByRole("checkbox", { name: "Plan my days" }).click();
  await page.getByRole("checkbox", { name: "Uni deadlines and classes" }).click();
  check(
    "help choices toggle",
    (await page.getByRole("checkbox", { name: "Plan my days" }).getAttribute("aria-checked")) === "true",
  );
  await shot("2-help");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Wind down 15 minutes earlier" }).click();
  check("wind down moves by 15 minutes", (await page.getByLabel("Wind down 22:15").count()) > 0);
  await shot("3-day");
  await page.getByRole("button", { name: "Continue" }).click();

  // 07:00 to 22:15 is 106.75 h awake, 107 rounded; 6 h of class a weekday is 30; everyday is 14.
  await page.getByText("63", { exact: true }).waitFor();
  check("the math says 63 hours to plan", true);
  await shot("4-math");
  await page.getByRole("button", { name: "Plan the first one" }).click();

  await page.getByRole("textbox", { name: "Your first thing for today" }).fill("Read 20 pages tonight at 21:30 for 30m");
  await page.getByText("21:30", { exact: true }).first().waitFor();
  check("the first thing is understood (time and length chips)", (await page.getByText("30 min", { exact: true }).count()) > 0);
  await shot("5-first");
  await page.getByRole("button", { name: "Add to today" }).click();

  await page.getByText("Save your plan.").waitFor();
  const sentence = await page.getByText(/You have\s+1 task today/).first().textContent();
  check(`step 6 says the day back: "${sentence?.trim()}"`, Boolean(sentence));
  await shot("6-save");
}

for (const scheme of ["light", "dark"]) {
  for (const [name, viewport] of [
    ["390", { width: 390, height: 844 }],
    ["1440", { width: 1440, height: 900 }],
  ]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const shot = (step) => page.screenshot({ path: artifact(`onb-${step}-${name}-${scheme}.png`) });
    console.log(`-- ${name} ${scheme}`);
    await throughSteps(page, shot);
    await page.getByRole("button", { name: "Sign in to save" }).click();
    await page.waitForURL(/\/sign-in/);
    check("step 6 opens sign-in", true);
    check("no page errors", errors.length === 0);
    if (errors.length) console.log(errors.join("\n"));
    await ctx.close();
  }
}

if (process.env.SIGNED_IN !== "0") {
  console.log("-- a new account, 390 light");
  const email = `kriyan.app.qa+clerk_test_onb${Date.now()}@example.com`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (step) => page.screenshot({ path: artifact(`onb-${step}-390-signedin.png`) });
  await throughSteps(page, shot);
  await page.getByRole("button", { name: "Sign in to save" }).click();
  await page.waitForURL(/\/sign-in/);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Calm-planner-2026!");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Code from the email").fill("424242", { timeout: 30000 });
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByText("Get a nudge").waitFor({ timeout: 90000 });
  check("after sign-up, onboarding saves the plan and continues at reminders", /\/welcome/.test(page.url()));
  await shot("7-reminders");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Bring in what").waitFor();
  await shot("8-connect");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("That's a plan.").waitFor();
  await shot("9-done");
  await page.getByRole("button", { name: "Open Today" }).click();
  await page.waitForURL(/\/today/);
  await settle(page);
  check("Open Today lands on Today", true);
  check("the first task is on Today", (await page.getByText("Read 20 pages", { exact: false }).count()) > 0);
  await shot("10-today");
  await page.goto(`${BASE}/today`);
  await settle(page);
  check("a reload stays on Today: onboarding happens once", /\/today/.test(page.url()));
  check("no page errors", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  console.log(`new test user: ${email}`);
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log("all passed");
