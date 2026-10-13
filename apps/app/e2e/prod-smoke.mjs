// Every production surface, as the test account: the web app, a token from Settings, the
// agent API, the CLI and the MCP server, then the token revoked. Reads only what it adds.
//   MSYS_NO_PATHCONV=1 KRIYAN_APP_URL=https://app.kriyan.app node apps/app/e2e/prod-smoke.mjs
// The token lives in memory only; it is never printed.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const SITE = process.env.KRIYAN_SITE_URL ?? "https://kriyan.app";
if (!BASE.startsWith("https://")) throw new Error("Set KRIYAN_APP_URL to the deployed app.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
let failed = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
};

const browser = await launch();
const ctx = await signedInContext(browser, { width: 1440, height: 900 });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const hosts = new Set();
page.on("websocket", (w) => hosts.add(new URL(w.url()).host));

await page.goto(`${BASE}/today`);
await settle(page);
check(await page.getByRole("navigation", { name: "Main" }).first().isVisible(), "web app signed in", BASE);
check(
  [...hosts].some((h) => h.endsWith(".convex.cloud")),
  "web app connected",
  [...hosts].join(", "),
);

// A token, the way a person connects an agent.
const name = `Smoke ${Date.now() % 100000}`;
await page.goto(`${BASE}/settings`);
await settle(page);
await page.getByRole("textbox", { name: "Token name" }).fill(name);
await page.getByRole("button", { name: "Create token" }).click();
await page.getByRole("button", { name: "Copy the token" }).click();
const token = await page.evaluate(() => navigator.clipboard.readText());
await page.getByRole("button", { name: "I've copied it" }).click();
check(token.startsWith("kriyan_"), "token created in Settings");

const api = (op, body, auth = true) =>
  fetch(`${SITE}/api/v1/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const listing = await (await fetch(`${SITE}/api/v1`)).json();
check(listing.operations?.length >= 19, "API lists operations", String(listing.operations?.length));
check((await api("get_today", {}, false)).status === 401, "API refuses a request without a token");
const today = await api("get_today");
check(today.status === 200, "API reads today with the token", String(today.status));

// The CLI against production (its default server is kriyan.app).
const cli = (...args) =>
  spawnSync("bun", ["packages/cli/src/main.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KRIYAN_TOKEN: token, NO_COLOR: "1" },
  });
const title = `CLI smoke ${Date.now() % 100000}`;
const added = cli("add", `${title} tomorrow 9am for 30m`);
check(added.status === 0, "CLI adds a task", added.stdout.trim().split("\n")[0] || added.stderr.trim());
const week = cli("week");
check(week.status === 0 && week.stdout.includes(title), "CLI reads it back in the week");

await page.goto(`${BASE}/upcoming`);
await settle(page);
const seen = await page
  .getByText(title)
  .first()
  .isVisible()
  .catch(() => false);
check(seen, "the CLI's task shows in the web app");
await page.screenshot({ path: artifact("prod-smoke-upcoming.png") });
const removed = cli("rm", title);
check(removed.status === 0, "CLI deletes it", removed.stdout.trim().split("\n")[0] || removed.stderr.trim());

// The MCP server, with both protocol eras clients send.
for (const era of ["modern", "legacy"]) {
  const mcp = spawnSync("node", ["apps/site/scripts/mcp-e2e.mjs", `${SITE}/mcp`, era], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KRIYAN_TOKEN: token },
  });
  const tools = /tools \((\d+)\)/.exec(mcp.stdout)?.[1];
  check(mcp.status === 0, `MCP ${era}: connect, list, read, add, delete`, `${tools ?? "?"} tools`);
}

// Revoke, then the same token is refused.
await page.goto(`${BASE}/settings`);
await settle(page);
await page
  .getByRole("button", { name: `Revoke ${name}` })
  .first()
  .click();
await page
  .getByRole("status")
  .filter({ hasText: `Revoked ${name}` })
  .first()
  .waitFor();
check((await api("get_today")).status === 401, "a revoked token is refused");

await browser.close();
console.log(failed ? `\nprod smoke: ${failed} failing` : "\nprod smoke: all surfaces pass");
process.exit(failed ? 1 : 0);
