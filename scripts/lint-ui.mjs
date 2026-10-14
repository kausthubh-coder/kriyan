// The Critly check against this checkout's running app, on the port in .env.ports. A script
// rather than `${PORT_APP}` in package.json, because bun's shell on Windows leaves that
// unexpanded and the check then exits 2 without running.
//   bun run lint:ui [critly flags]
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PORTS_FILE, readEnv, root } from "./checkout.mjs";

const port = readEnv(PORTS_FILE)?.PORT_APP;
if (!port) {
  console.error(`${PORTS_FILE} has no PORT_APP: run \`bun run setup\`. critly check: could not run · exit 2`);
  process.exit(2);
}
const pkg = createRequire(join(root, "package.json")).resolve("@kausthubh/critly/package.json");
const bin = join(dirname(pkg), "bin", "critly.js");
const run = spawnSync(
  process.execPath,
  [bin, "check", `http://localhost:${port}`, ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
  },
);
process.exit(run.status ?? 2);
