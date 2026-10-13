// Calls the agent API as the test account, signed with the dev service secret.
//   node apps/app/e2e/api.mjs get_today
//   node apps/app/e2e/api.mjs add_task '{"text":"Stretch in 5 min remind 1 min before"}'
// The test account's Clerk id comes from the last `seed.mjs` run (.artifacts/app/user.json).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifact } from "./lib.mjs";

const root = new URL("../../../", import.meta.url);
const envOf = (file, name) =>
  new RegExp(`^${name}=(.*)$`, "m").exec(readFileSync(new URL(file, root), "utf8"))?.[1]?.trim();
const SITE = envOf("packages/convex/.env.local", "CONVEX_SITE_URL");
const SECRET = envOf("apps/site/.env.local", "KRIYAN_SERVICE_SECRET");
const DEPLOYMENT = envOf("packages/convex/.env.local", "CONVEX_DEPLOYMENT") ?? "";
if (!SITE || !SECRET) throw new Error("Run `bun run setup`: the dev env files are missing.");
// Only this checkout's own local backend (`bun run setup` makes it); never the shared dev or prod.
if (!/^(anonymous|local):/.test(DEPLOYMENT))
  throw new Error(`Refusing to touch ${DEPLOYMENT}: this checkout's local backend only.`);

const USER_FILE = artifact("user.json");
export const saveUser = (userId) => writeFileSync(USER_FILE, JSON.stringify({ userId }));
export const savedUser = () =>
  existsSync(USER_FILE) ? JSON.parse(readFileSync(USER_FILE, "utf8")).userId : undefined;

export async function op(name, input = {}, userId = savedUser()) {
  if (!userId) throw new Error("No test user yet: run `node apps/app/e2e/seed.mjs` first.");
  const res = await fetch(`${SITE}/api/v1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SECRET}`,
      "x-kriyan-user": userId,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(body)}`);
  return body.result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, json] = process.argv.slice(2);
  if (name) console.log(JSON.stringify(await op(name, json ? JSON.parse(json) : {}), null, 2));
}
