// Resets the test account and fills it with a known plan, dated from today in the browser's
// time zone, so every e2e script starts from the same place on any day.
//   node apps/app/e2e/seed.mjs            reset, then seed
//   node apps/app/e2e/seed.mjs --reset    reset only (an empty account)
// Writes go through the agent API (see api.mjs); dev deployment only.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { op as apiOp, saveUser } from "./api.mjs";
import { BASE, launch, settle, signedInContext } from "./lib.mjs";

const root = new URL("../../../", import.meta.url);
// The Convex CLI run directly (no shell), so JSON arguments keep their quotes on Windows.
const convexBin = fileURLToPath(new URL("node_modules/convex/bin/main.js", root));
const convex = (...args) =>
  execFileSync(process.execPath, [convexBin, ...args], {
    cwd: new URL("packages/convex/", root),
    encoding: "utf8",
  }).trim();

const browser = await launch();
const ctx = await signedInContext(browser);
const page = await ctx.newPage();
await page.goto(`${BASE}/today`);
await settle(page);
const userId = await page.evaluate(() => window.Clerk?.user?.id);
if (!userId) throw new Error("Not signed in: no Clerk user on the page.");

saveUser(userId);
const op = (name, input) => apiOp(name, input, userId);

// Reset: delete everything the test user owns, then wait until it's gone.
const issuer = convex("env", "get", "CLERK_JWT_ISSUER_DOMAIN");
convex("run", "account:deleteDataBatch", JSON.stringify({ ownerId: `${issuer}|${userId}` }));
for (let i = 0; ; i++) {
  if (!(await op("list_spaces")).length) break;
  if (i > 20) throw new Error("Reset didn't finish.");
  await new Promise((r) => setTimeout(r, 500));
}
// Opening the app recreates the profile with the browser's time zone, so "today" matches.
await page.reload();
await settle(page);
console.log(`reset    ${userId}`);

if (!process.argv.includes("--reset")) {
  const space = async (name, color, parentId) =>
    (await op("add_space", { name, color, ...(parentId ? { parentId } : {}) })).spaceId;
  const work = await space("Work", "blue");
  await space("Kriyan", "blue", work);
  await space("Clients", "blue", work);
  const school = await space("School", "blue");
  await space("Calculus", "blue", school);
  await space("Physics", "blue", school);
  await space("Life", "blue");

  const sentences = [
    "Write MCP tools today 10:00 for 1h30 #work/kriyan",
    "Book the dentist today #life",
    "Run every 2 days after done #life",
    "Read chapter 7.4 today 22:00 #school/physics",
    "Calculus II lecture every tue and thu 9am for 1h30 #school/calculus",
    "Mum's birthday 16 oct every year remind day before at 20:00 #life",
    "Send the invoice tomorrow #work/clients",
    "Problem set 4 due fri #school/calculus",
    "Look into standing desks",
  ];
  for (const text of sentences) await op("add_task", { text });
  console.log(`seeded   7 spaces, ${sentences.length} tasks`);
}
await browser.close();
