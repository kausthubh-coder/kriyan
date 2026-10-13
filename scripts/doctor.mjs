// Is this checkout ready to work in, and isolated from the others? Read-only; prints the
// command that fixes each failure and ends with one summary line. Never prints secret values.
//   bun run doctor
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ENV,
  CONVEX_ENV,
  PORTS_FILE,
  PORT_KEYS,
  SHARED_DEV,
  SITE_ENV,
  backendEnvNames,
  git,
  isLocal,
  mainCheckout,
  otherCheckouts,
  readEnv,
  root,
  samePath,
} from "./checkout.mjs";

let failed = 0;
const ok = (msg) => console.log(`ok    ${msg}`);
const warn = (msg) => console.log(`warn  ${msg}`);
const fail = (msg, fix) => {
  failed++;
  console.log(`FAIL  ${msg}: ${fix}`);
};
const SETUP = "run `bun run setup`";

const main = mainCheckout();
samePath(main, root)
  ? warn(`this is the main checkout; work in a worktree (see the worktree-kriyan skill)`)
  : ok(`worktree; the main checkout is ${main} (never edit it)`);

existsSync(join(root, ".claude", "skills"))
  ? ok(".claude/skills is linked")
  : fail(".claude/skills is missing", SETUP);

const stamp = join(root, "node_modules", ".kriyan-installed");
if (!existsSync(stamp)) fail("dependencies not installed", SETUP);
else if (statSync(stamp).mtimeMs < statSync(join(root, "bun.lock")).mtimeMs)
  fail("bun.lock changed since the last install", SETUP);
else ok("dependencies match bun.lock");

const app = readEnv(APP_ENV);
const site = readEnv(SITE_ENV);
for (const [file, values, vars] of [
  [APP_ENV, app, ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]],
  [
    SITE_ENV,
    site,
    [
      "NEXT_PUBLIC_CONVEX_URL",
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "KRIYAN_SERVICE_SECRET",
      "CLERK_SECRET_KEY",
    ],
  ],
]) {
  if (!values) {
    fail(`${file} is missing`, `${SETUP} (it copies from ~/.kriyan/dev-env)`);
    continue;
  }
  if (Object.values(values).some((v) => /^(pk|sk)_live_/.test(v)))
    fail(`${file} holds PRODUCTION Clerk keys`, "replace it with the dev copy from ~/.kriyan/dev-env");
  const missing = vars.filter((v) => !values[v]);
  missing.length
    ? warn(`${file} lacks ${missing.join(", ")}`)
    : ok(`${file} has its ${vars.length} variables`);
}

const ports = readEnv(PORTS_FILE);
const clashes = otherCheckouts().filter((dir) => {
  const theirs = readEnv(PORTS_FILE, dir);
  return theirs && PORT_KEYS.some((k) => ports?.[k] && theirs[k] === ports[k]);
});
if (!ports || !samePath(ports.PORTS_FOR ?? "", root) || !PORT_KEYS.every((k) => ports[k]))
  fail(`${PORTS_FILE} is missing or was written for another checkout`, SETUP);
else if (clashes.length)
  fail(`ports clash with ${clashes.join(", ")}`, `delete ${PORTS_FILE}, then ${SETUP}`);
else ok(`ports: app ${ports.PORT_APP}, site ${ports.PORT_SITE}, convex ${ports.PORT_CONVEX}`);

const backend = readEnv(CONVEX_ENV);
const deployment = backend?.CONVEX_DEPLOYMENT;
let backendNote = "no backend";
if (!deployment) fail("no Convex backend for this checkout", SETUP);
else if (/^prod:/.test(deployment)) fail(`Convex points at PRODUCTION (${deployment})`, SETUP);
else if (!isLocal(deployment))
  fail(
    `Convex points at the shared ${deployment === SHARED_DEV ? "dev deployment" : "deployment"} ${deployment}`,
    `${SETUP} to give this checkout its own`,
  );
else {
  backendNote = `own Convex backend :${new URL(backend.CONVEX_URL).port}`;
  ok(`Convex: this checkout's own local backend at ${backend.CONVEX_URL}`);
  if (ports && backend.CONVEX_URL !== `http://127.0.0.1:${ports.PORT_CONVEX}`)
    fail(`the backend isn't on PORT_CONVEX ${ports.PORT_CONVEX}`, SETUP);
  const pointed =
    app?.EXPO_PUBLIC_CONVEX_URL === backend.CONVEX_URL &&
    site?.NEXT_PUBLIC_CONVEX_URL === backend.CONVEX_URL &&
    site?.NEXT_PUBLIC_CONVEX_SITE_URL === backend.CONVEX_SITE_URL;
  pointed ? ok("app and site use that backend") : fail("the app or site points at another backend", SETUP);
  const names = existsSync(stamp) ? backendEnvNames() : null;
  const needed = ["CLERK_JWT_ISSUER_DOMAIN", "KRIYAN_SERVICE_SECRET"];
  if (!names) warn("couldn't read the backend's env vars");
  else {
    const unset = needed.filter((n) => !names.has(n));
    unset.length ? fail(`backend lacks ${unset.join(", ")}`, SETUP) : ok("backend has its env vars");
  }
  try {
    const res = await fetch(`${backend.CONVEX_URL}/version`, { signal: AbortSignal.timeout(3000) });
    res.ok ? ok("backend is running") : warn(`backend answered ${res.status}`);
  } catch {
    ok("backend is stopped (`bun run dev` starts it)");
  }
}

let behind = "unknown";
try {
  git("fetch", "origin", "main", "-q");
  behind = git("rev-list", "--count", "HEAD..origin/main");
  Number(behind) > 0 ? warn(`${behind} commits behind origin/main`) : ok("up to date with origin/main");
} catch {
  warn("couldn't compare with origin/main");
}

const where = ports ? `app :${ports.PORT_APP}, site :${ports.PORT_SITE}, ${backendNote}` : backendNote;
console.log(
  failed
    ? `\nkriyan: ${failed} problem(s); fix the FAIL lines above. ${where}.`
    : `\nkriyan: ready. ${where}, ${behind} behind origin/main.`,
);
process.exit(failed ? 1 : 0);
