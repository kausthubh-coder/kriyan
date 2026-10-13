// An agent proposes blocks through the agent API (with a token made in Settings, the way a
// person connects the CLI), then the person reviews them on Upcoming and accepts them.
//   node apps/app/e2e/proposals.mjs

import { readFileSync } from "node:fs";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const env = readFileSync(new URL("../../../packages/convex/.env.local", import.meta.url), "utf8");
const site = /^CONVEX_SITE_URL=(.+)$/m.exec(env)?.[1]?.trim().replace(/^"|"$/g, "");
if (!site) throw new Error("CONVEX_SITE_URL is missing from packages/convex/.env.local");

const browser = await launch();
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const ctx = await signedInContext(browser, viewport);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // A token, made and copied the way the Settings screen offers it.
  await page.goto(`${BASE}/settings`);
  await settle(page);
  await page.getByRole("textbox", { name: "Token name" }).fill("Proposal test");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.getByRole("button", { name: "Copy the token" }).click();
  const token = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByRole("button", { name: "I've copied it" }).click();

  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(),
    ),
  );
  const plus = (n) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${site}/api/v1/propose_plan`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      agent: "Claude",
      blocks: [
        { title: "Record the demo", date: plus(3), time: 15 * 60 + 30, length: 90 },
        { title: "Ship the CLI", date: plus(4), time: 10 * 60, length: 120 },
      ],
    }),
  });
  console.log(`propose_plan: HTTP ${res.status}`);

  await page.goto(`${BASE}/upcoming`);
  await settle(page);
  await page.getByText(/^Claude proposed 2 blocks/).waitFor();
  await page.screenshot({ path: artifact(`upcoming-proposals-${viewport.width}.png`) });
  if (viewport.width === 1440) {
    await page.getByRole("button", { name: "Accept all" }).click();
    await page.getByRole("status").filter({ hasText: "Added 2 to your plan" }).waitFor();
    console.log("accepted: banner gone =", (await page.getByText(/^Claude proposed/).count()) === 0);
  } else {
    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("status").filter({ hasText: "Discarded 2 proposed" }).waitFor();
    console.log("discarded: banner gone =", (await page.getByText(/^Claude proposed/).count()) === 0);
  }

  // Revoke the token again.
  await page.goto(`${BASE}/settings`);
  await settle(page);
  await page.getByRole("button", { name: "Revoke Proposal test" }).first().click();
  await ctx.close();
}
await browser.close();
