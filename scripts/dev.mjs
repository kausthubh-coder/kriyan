// Starts the backend watcher, the app on the web and the site, on this checkout's ports.
// Ready when the app prints "Web is waiting on http://localhost:<PORT_APP>" and the site "Ready".
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const portsFile = join(root, ".env.ports");
const ports = existsSync(portsFile)
  ? Object.fromEntries(
      readFileSync(portsFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => l.split("=")),
    )
  : { PORT_APP: "8081", PORT_SITE: "3000" };

const run = (name, cwd, args) => {
  const child = spawn("bun", args, {
    cwd: join(root, cwd),
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (d) => process.stdout.write(d.toString().replace(/^/gm, `[${name}] `)));
  child.on("exit", (code) => console.log(`[${name}] exited with ${code}`));
  return child;
};

const children = [
  run("convex", "packages/convex", ["x", "convex", "dev"]),
  run("app", "apps/app", ["x", "expo", "start", "--web", "--port", ports.PORT_APP]),
  run("site", "apps/site", ["x", "next", "dev", "--port", ports.PORT_SITE]),
];
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
