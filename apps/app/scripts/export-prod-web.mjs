// Builds the web app for app.kriyan.app into dist/, with production values only.
//   bun run export:prod      (then `bunx vercel deploy --prod` inside dist/, see docs/ops.md)
// Expo loads .env.local over values passed on the command line, so a plain export ships the
// dev backend. This turns dotenv off, takes values from ~/.kriyan/prod-env/app.env, and checks
// the bundle before it can be deployed.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const app = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const envFile = process.env.KRIYAN_PROD_APP_ENV ?? join(homedir(), ".kriyan", "prod-env", "app.env");
if (!existsSync(envFile)) throw new Error(`Missing ${envFile} (EXPO_PUBLIC_CONVEX_URL and the Clerk key).`);
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^EXPO_PUBLIC_\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const name of ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"])
  if (!env[name]) throw new Error(`${envFile} lacks ${name}.`);

// Expo empties dist/; keep its Vercel link (dist/.vercel) aside and put it back.
const dist = join(app, "dist");
const link = join(dist, ".vercel");
const kept = existsSync(link) ? join(mkdtempSync(join(tmpdir(), "kriyan-vercel-")), ".vercel") : null;
if (kept) cpSync(link, kept, { recursive: true });

execFileSync("bunx", ["expo", "export", "--platform", "web", "--clear"], {
  cwd: app,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, ...env, EXPO_NO_DOTENV: "1" },
});

const jsDir = join(dist, "_expo", "static", "js", "web");
const bundle = readdirSync(jsDir)
  .map((f) => readFileSync(join(jsDir, f), "utf8"))
  .join("\n");
const host = new URL(env.EXPO_PUBLIC_CONVEX_URL).host;
if (!bundle.includes(host)) throw new Error(`The bundle doesn't mention ${host}.`);
const devUrl = /^CONVEX_URL=(.*)$/m
  .exec(readFileSync(join(app, "..", "..", "packages", "convex", ".env.local"), "utf8"))?.[1]
  ?.trim();
const devHost = devUrl ? new URL(devUrl).host : null;
if (devHost && bundle.includes(devHost))
  throw new Error(`The bundle points at the dev ${devHost}. Don't deploy it.`);
if (kept) {
  cpSync(kept, link, { recursive: true });
  rmSync(join(kept, ".."), { recursive: true, force: true });
}
if (!existsSync(join(dist, "vercel.json")))
  throw new Error("dist/vercel.json is missing (it comes from public/).");
console.log(`\ndist/ is ready for app.kriyan.app: Convex ${host}, single-page rewrites in vercel.json.`);
