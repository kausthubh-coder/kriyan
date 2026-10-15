// Shared helpers for driving the web app with Playwright: launch, sign in as a Clerk test
// account (code 424242 on the dev instance), and screenshot at phone and desktop widths.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { launchBrowser } from "../../../scripts/browser.mjs";

const root = new URL("../../../", import.meta.url);
const ports = existsSync(new URL(".env.ports", root))
  ? readFileSync(new URL(".env.ports", root), "utf8")
  : "";
export const PORT = process.env.PORT_APP ?? /PORT_APP=(\d+)/.exec(ports)?.[1] ?? "8081";
// KRIYAN_APP_URL points the scripts at a deployed app, e.g. https://app.kriyan.app.
export const BASE = process.env.KRIYAN_APP_URL ?? `http://localhost:${PORT}`;
export const ARTIFACTS = new URL(".artifacts/app/", root);
mkdirSync(ARTIFACTS, { recursive: true });
export const artifact = (name) => new URL(name, ARTIFACTS).pathname.replace(/^\/([A-Z]:)/, "$1");

export const EMAIL = process.env.KRIYAN_TEST_EMAIL ?? "kriyan.app.qa+clerk_test@example.com";
export const PASSWORD = process.env.KRIYAN_TEST_PASSWORD ?? "Calm-planner-2026!";

export async function launch() {
  return launchBrowser();
}

const STATE = artifact("auth-state.json");

/** A context that is signed in: reuses the saved session, or signs in (or up) through the UI. */
export async function signedInContext(browser, viewport = { width: 1440, height: 900 }) {
  if (existsSync(STATE)) {
    const ctx = await browser.newContext({ viewport, storageState: STATE, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/today`);
    // Wait for whichever renders: the app's navigation (signed in) or the sign-in form.
    const ok = await Promise.race([
      page
        .getByRole("navigation", { name: "Main" })
        .first()
        .waitFor({ timeout: 60000 })
        .then(() => true),
      page
        .getByRole("button", { name: "Sign in", exact: true })
        .waitFor({ timeout: 60000 })
        .then(() => false),
    ]).catch(() => false);
    await page.close();
    if (ok) return ctx;
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await signIn(page);
  await ctx.storageState({ path: STATE });
  await page.close();
  return ctx;
}

export async function signIn(page) {
  page.setDefaultTimeout(120000);
  await page.goto(`${BASE}/sign-in`);
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 15000 }).then(() => "in"),
    page
      .getByRole("alert")
      .waitFor({ timeout: 15000 })
      .then(() => "error"),
    page
      .getByLabel("Code from the email")
      .waitFor({ timeout: 15000 })
      .then(() => "code"),
  ]);
  if (outcome === "in") return;
  if (outcome === "code") {
    // A new browser counts as a new device: confirm it with the test code.
    await page.getByLabel("Code from the email").fill("424242");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
    return;
  }
  console.log(`sign-in said: ${await page.getByRole("alert").innerText()}`);
  // No account yet: create it, then verify with the test code.
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Code from the email").fill("424242", { timeout: 20000 });
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
}

/** Waits until skeletons are gone and the fonts are in. */
export async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60000 });
  await page
    .waitForFunction(() => !document.querySelector('[data-testid="skeleton"]'), null, { timeout: 20000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}
