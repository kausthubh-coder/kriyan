// Starts this checkout's own Convex backend (watching for changes), the app on the web and the
// site, on the ports in .env.ports. Ready when the log shows "Convex functions ready", the app's
// "Waiting on http://localhost:<PORT_APP>" and the site's "Ready". Ctrl+C or killing this
// process stops all three.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONVEX_ENV, PORTS_FILE, PORT_KEYS, isLocal, readEnv, root, samePath } from "./checkout.mjs";

const ports = readEnv(PORTS_FILE);
const backend = readEnv(CONVEX_ENV);
if (!ports || !samePath(ports.PORTS_FOR ?? "", root) || !PORT_KEYS.every((k) => ports[k])) {
  console.error(`${PORTS_FILE} is missing or was written for another checkout: run \`bun run setup\`.`);
  process.exit(1);
}
// Only a local backend is safe to push to on every save; never the shared dev or production.
if (!isLocal(backend?.CONVEX_DEPLOYMENT)) {
  console.error(
    `${CONVEX_ENV} points at ${backend?.CONVEX_DEPLOYMENT ?? "nothing"}: run \`bun run setup\` to give this checkout its own backend.`,
  );
  process.exit(1);
}
console.log(
  `kriyan dev: app http://localhost:${ports.PORT_APP}, site http://localhost:${ports.PORT_SITE}, backend ${backend.CONVEX_URL}`,
);

const convexBin = join(
  dirname(createRequire(join(root, "packages", "convex", "package.json")).resolve("convex/package.json")),
  "bin",
  "main.js",
);
const run = (name, cwd, command, args) => {
  const child = spawn(command, args, {
    cwd: join(root, cwd),
    stdio: "pipe",
    shell: command === "bun" && process.platform === "win32",
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (d) => process.stdout.write(d.toString().replace(/^/gm, `[${name}] `)));
  child.on("exit", (code) => console.log(`[${name}] exited with ${code}`));
  return child;
};

const children = [
  run("convex", "packages/convex", process.execPath, [
    convexBin,
    "dev",
    "--local-cloud-port",
    ports.PORT_CONVEX,
    "--local-site-port",
    ports.PORT_CONVEX_SITE,
  ]),
  run("app", "apps/app", "bun", ["x", "expo", "start", "--web", "--port", ports.PORT_APP]),
  run("site", "apps/site", "bun", ["x", "next", "dev", "--port", ports.PORT_SITE]),
];

// On Windows a child started through a shell leaves its own children behind; kill each tree.
const stop = () => {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
