// Is this checkout and its backend healthy? Run it first whenever something looks off.
// Prints names and verdicts only, never secret values.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
let failed = 0;
const ok = (msg) => console.log(`ok    ${msg}`);
const warn = (msg) => console.log(`warn  ${msg}`);
const fail = (msg) => {
  failed++;
  console.log(`FAIL  ${msg}`);
};

function env(file) {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

existsSync(join(root, "node_modules"))
  ? ok("dependencies installed")
  : fail("dependencies missing: run `bun run setup`");

const convex = env("packages/convex/.env.local");
const app = env("apps/app/.env.local");
const site = env("apps/site/.env.local");
if (!convex?.CONVEX_DEPLOYMENT)
  fail("packages/convex/.env.local has no CONVEX_DEPLOYMENT: run `bun run setup`");
else if (/^prod:/.test(convex.CONVEX_DEPLOYMENT))
  fail("this checkout points at PRODUCTION Convex; dev work must use a dev or local deployment");
else
  ok(
    `Convex deployment is ${convex.CONVEX_DEPLOYMENT.split(":")[0]} (${convex.CONVEX_DEPLOYMENT.split(":")[1]})`,
  );

for (const [file, vars, values] of [
  ["apps/app/.env.local", ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"], app],
  [
    "apps/site/.env.local",
    [
      "NEXT_PUBLIC_CONVEX_URL",
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ],
    site,
  ],
]) {
  if (!values) {
    fail(`${file} is missing: run \`bun run setup\``);
    continue;
  }
  const missing = vars.filter((v) => !values[v]);
  missing.length ? warn(`${file} lacks ${missing.join(", ")}`) : ok(`${file} has ${vars.length} variables`);
}

for (const [name, key] of [
  ["app", app?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY],
  ["site", site?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY],
]) {
  if (key?.startsWith("pk_live_")) fail(`${name} uses the PRODUCTION Clerk instance; dev uses pk_test_ keys`);
}
if (site?.CLERK_SECRET_KEY?.startsWith("sk_live_")) fail("site uses the PRODUCTION Clerk secret key");

if (convex?.CONVEX_URL) {
  try {
    const res = await fetch(`${convex.CONVEX_URL}/version`, { signal: AbortSignal.timeout(8000) });
    res.ok ? ok("Convex is reachable") : fail(`Convex answered ${res.status}`);
  } catch (e) {
    fail(`Convex is unreachable (${e.message})`);
  }
}

try {
  execSync("git fetch origin -q", { cwd: root, stdio: "ignore", timeout: 15000 });
  const behind = execSync("git rev-list --count HEAD..origin/rebuild", { cwd: root }).toString().trim();
  Number(behind) > 0 ? warn(`${behind} commits behind origin/rebuild`) : ok("up to date with origin/rebuild");
} catch {
  warn("couldn't compare with origin/rebuild");
}

console.log(failed ? `\n${failed} problem(s).` : "\nHealthy.");
process.exit(failed ? 1 : 0);
