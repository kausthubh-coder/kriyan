// The Critly check against this checkout's running app, signed in, on the port in .env.ports:
// every screen and open state at 390 and 1440 (apps/app/e2e/critly-signed-in.mjs), plus the
// sign-in screen signed out. Signed out, every other route redirects to sign-in, so a check
// without the saved sign-in would pass while looking at one screen; it stops instead.
//   bun run lint:ui        exit 0 clean, 1 findings, 2 couldn't run
// A script rather than `${PORT_APP}` in package.json, because bun's shell on Windows leaves that
// unexpanded and the check then exits 2 without running.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PORTS_FILE, readEnv, root } from "./checkout.mjs";

const cannot = (why) => {
  console.error(`${why}\ncritly check: could not run · exit 2`);
  process.exit(2);
};

const port = readEnv(PORTS_FILE)?.PORT_APP;
if (!port) cannot(`${PORTS_FILE} has no PORT_APP: run \`bun run setup\`.`);
const url = `http://localhost:${port}`;
const up = await fetch(url, { signal: AbortSignal.timeout(30000) }).then(
  (r) => r.ok,
  () => false,
);
if (!up)
  cannot(`Nothing answers at ${url}: start the app with \`bun run dev\` and wait for "Waiting on ${url}".`);
const saved = join(root, ".artifacts", "app", "auth-state.json");
if (!existsSync(saved))
  cannot(
    `No saved sign-in at ${saved}: run \`node apps/app/e2e/seed.mjs\` once (it signs in as the test account and saves the session), then run this again.`,
  );

const run = spawnSync(process.execPath, [join(root, "apps", "app", "e2e", "critly-signed-in.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT_APP: port },
});
process.exit(run.status === 0 || run.status === 1 ? run.status : 2);
