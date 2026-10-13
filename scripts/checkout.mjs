// What setup, doctor and dev share: where this checkout is, its env files, its ports and its backend.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_ENV = "apps/app/.env.local";
export const SITE_ENV = "apps/site/.env.local";
export const CONVEX_ENV = "packages/convex/.env.local";
export const PORTS_FILE = ".env.ports";
export const PORT_KEYS = ["PORT_APP", "PORT_SITE", "PORT_CONVEX", "PORT_CONVEX_SITE"];
/** The Convex dev deployment every checkout used to share. Nothing pushes to it now. */
export const SHARED_DEV = "dev:wry-parrot-108";

export const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** The main checkout (the folder that owns .git). Agents never edit it. */
export const mainCheckout = () => dirname(resolve(root, git("rev-parse", "--git-common-dir")));

/** Every other checkout of this repo, from `git worktree list`. */
export const otherCheckouts = () =>
  git("worktree", "list", "--porcelain")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => resolve(l.slice("worktree ".length)))
    .filter((dir) => samePath(dir, root) === false);

export const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** KEY=value lines of an env file as an object, or null when the file is missing. */
export function readEnv(file, dir = root) {
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l
          .slice(l.indexOf("=") + 1)
          .replace(/\s+#.*$/, "")
          .trim(),
      ]),
  );
}

/** A local backend lives in packages/convex/.convex/local and belongs to this checkout alone. */
export const isLocal = (deployment) => /^(anonymous|local):/.test(deployment ?? "");

/** Runs the Convex CLI in packages/convex, without a shell. Returns spawnSync's result. */
export function convex(args, options = {}) {
  const pkg = createRequire(join(root, "packages", "convex", "package.json")).resolve("convex/package.json");
  return spawnSync(process.execPath, [join(dirname(pkg), "bin", "main.js"), ...args], {
    cwd: join(root, "packages", "convex"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

/** Variable names set on this checkout's backend (values are never returned). */
export function backendEnvNames() {
  const listed = convex(["env", "list"]);
  if (listed.status !== 0) return null;
  return new Set(
    listed.stdout
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => l.slice(0, l.indexOf("="))),
  );
}
