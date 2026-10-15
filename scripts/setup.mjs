// Makes this checkout ready to work in, isolated from every other worktree. Safe to rerun:
// when nothing is missing it takes a few seconds. T3 runs it when it creates a worktree.
//   bun run setup
// Steps: link skills, copy dev env, install, pick ports, give the checkout its own local
// Convex backend, point the app and site at it, then run the doctor.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createConnection, createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  APP_ENV,
  CLOUD_ENV,
  CONVEX_ENV,
  PLACEHOLDER_ISSUER,
  PORTS_FILE,
  PORT_KEYS,
  SITE_ENV,
  backendEnvNames,
  backendEnvValue,
  convex,
  inCloud,
  isLocal,
  mainCheckout,
  otherCheckouts,
  readEnv,
  root,
  samePath,
} from "./checkout.mjs";

const log = (verb, msg) => console.log(`${verb.padEnd(9)} ${msg}`);
const stop = (msg) => {
  console.error(`FAIL      ${msg}`);
  process.exit(1);
};

// 1. Claude Code reads .claude/skills, Codex reads .agents/skills: one folder, linked.
const claudeSkills = join(root, ".claude", "skills");
if (!existsSync(claudeSkills)) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  symlinkSync(join(root, ".agents", "skills"), claudeSkills, "junction");
  log("linked", ".claude/skills -> .agents/skills");
}

// 2. Dev env. The store sits outside the repo and outside OneDrive; the main checkout is the fallback.
// packages/convex/.env.local is never copied: the Convex CLI writes it for this checkout's backend.
const store = process.env.KRIYAN_ENV_DIR ?? join(homedir(), ".kriyan", "dev-env");
const PRODUCTION = /pk_live_|sk_live_|prod:|brave-sheep-245/;
/** Sets KEY=value lines in an env file, creating it when missing. Returns the names it changed. */
const setEnv = (file, values) => {
  const path = join(root, file);
  const existed = existsSync(path);
  let text = existed ? readFileSync(path, "utf8") : "";
  const changed = [];
  for (const [name, value] of Object.entries(values)) {
    if (readEnv(file)?.[name] === value) continue;
    const line = new RegExp(`^${name}=.*$`, "m");
    text = line.test(text)
      ? text.replace(line, `${name}=${value}`)
      : `${text.replace(/\s*$/, "")}\n${name}=${value}\n`;
    changed.push(name);
  }
  if (!existed || changed.length) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text.replace(/^\n/, ""));
  }
  return changed;
};
for (const file of [APP_ENV, SITE_ENV]) {
  const target = join(root, file);
  if (inCloud && !existsSync(join(store, file))) {
    // A cloud VM has no store and no main checkout to copy from. The cloud environment's own
    // variables fill the file instead, on every run, so setting one later takes effect on rerun.
    const values = Object.fromEntries(
      CLOUD_ENV.filter((v) => v.file === file)
        .map((v) => [
          v.name,
          process.env[v.name] ??
            (v.name === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
              ? process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
              : undefined),
        ])
        .filter(([, value]) => value),
    );
    if (PRODUCTION.test(Object.values(values).join("\n"))) {
      log("skipped", `${file}: the cloud environment holds production values`);
      continue;
    }
    const fresh = !existsSync(target);
    const changed = setEnv(file, values);
    if (fresh || changed.length)
      log("wrote", `${file} from the cloud environment (${changed.join(", ") || "no Clerk keys"})`);
    continue;
  }
  if (existsSync(target)) continue;
  const source = [join(store, file), join(mainCheckout(), file)].find((p) => existsSync(p) && p !== target);
  if (!source) {
    log("missing", `${file}: put the dev copy at ${join(store, file)}`);
    continue;
  }
  const text = readFileSync(source, "utf8");
  if (PRODUCTION.test(text)) {
    log("skipped", `${file}: ${source} holds production values`);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  log("copied", `${file} from ${source}`);
}
// The site and this checkout's backend share the service secret, and nothing else checks it, so
// when the dev env has none a random one works as well.
if (readEnv(SITE_ENV) && !readEnv(SITE_ENV).KRIYAN_SERVICE_SECRET) {
  setEnv(SITE_ENV, { KRIYAN_SERVICE_SECRET: randomBytes(32).toString("hex") });
  log("generated", `KRIYAN_SERVICE_SECRET in ${SITE_ENV}, for this checkout's backend only`);
}

// 3. Install only when node_modules is older than bun.lock; a no-op `bun install` still takes ~20s.
const stamp = join(root, "node_modules", ".kriyan-installed");
if (!existsSync(stamp) || statSync(stamp).mtimeMs < statSync(join(root, "bun.lock")).mtimeMs) {
  log("install", "bun install --frozen-lockfile");
  const installed = spawnSync("bun install --frozen-lockfile", { cwd: root, stdio: "inherit", shell: true });
  if (installed.status !== 0) stop("bun install failed");
  writeFileSync(stamp, `${new Date().toISOString()}\n`);
}

// 4. Ports from a hash of this checkout's path, so they stay put across reruns, skipping any
// port in use or written down by another worktree.
const portsFor = (slot) => ({
  PORT_APP: 8100 + slot,
  PORT_SITE: 3300 + slot,
  PORT_CONVEX: 4400 + 2 * slot,
  PORT_CONVEX_SITE: 4401 + 2 * slot,
});
const SLOTS = 200;
const taken = new Set(
  otherCheckouts().flatMap((dir) =>
    PORT_KEYS.map((k) => Number(readEnv(PORTS_FILE, dir)?.[k])).filter(Boolean),
  ),
);
const listening = (port) =>
  new Promise((done) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("error", () => done(false));
  });
const bindable = (port) =>
  new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
const free = async (port) => !taken.has(port) && !(await listening(port)) && (await bindable(port));

let ports = readEnv(PORTS_FILE);
const kept =
  ports &&
  samePath(ports.PORTS_FOR ?? "", root) &&
  PORT_KEYS.every((k) => ports[k] && !taken.has(Number(ports[k])));
if (!kept) {
  const start = createHash("sha256").update(root.toLowerCase()).digest().readUInt32BE(0) % SLOTS;
  let chosen = null;
  for (let i = 0; i < SLOTS && !chosen; i++) {
    const candidate = portsFor((start + i) % SLOTS);
    const checks = await Promise.all(Object.values(candidate).map(free));
    if (checks.every(Boolean)) chosen = candidate;
  }
  if (!chosen) stop("no free set of ports in 8100-8299, 3300-3499, 4400-4799");
  ports = { PORTS_FOR: root, ...chosen };
  writeFileSync(
    join(root, PORTS_FILE),
    `${Object.entries(ports)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
  );
  log("ports", `app ${ports.PORT_APP}, site ${ports.PORT_SITE}, convex ${ports.PORT_CONVEX} (${PORTS_FILE})`);
}

// 5. This checkout's own Convex backend: an anonymous local deployment, state in
// packages/convex/.convex/local, on PORT_CONVEX. Nothing here can push to a cloud deployment.
const convexEnvPath = join(root, CONVEX_ENV);
const before = readEnv(CONVEX_ENV)?.CONVEX_DEPLOYMENT;
if (before && !isLocal(before)) {
  // Older setups copied the shared dev deployment in here. Drop it so the CLI makes a local one.
  writeFileSync(
    convexEnvPath,
    readFileSync(convexEnvPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^(CONVEX_DEPLOYMENT|CONVEX_URL|CONVEX_SITE_URL)=/.test(l))
      .join("\n"),
  );
  log("switched", `Convex from ${before} to a local backend for this checkout`);
}
const configFile = join(root, "packages", "convex", ".convex", "local", "default", "config.json");
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")) : null;
const portArgs = [
  "--local-cloud-port",
  String(ports.PORT_CONVEX),
  "--local-site-port",
  String(ports.PORT_CONVEX_SITE),
];
let push = false;
if (
  !isLocal(readEnv(CONVEX_ENV)?.CONVEX_DEPLOYMENT) ||
  config?.ports?.cloud !== Number(ports.PORT_CONVEX) ||
  config?.ports?.site !== Number(ports.PORT_CONVEX_SITE)
) {
  log("backend", `creating a local Convex backend on ${ports.PORT_CONVEX}`);
  // The first push fails until the env vars below exist; the deployment is created either way.
  const created = convex(
    [
      "dev",
      "--once",
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
      "--tail-logs",
      "disable",
      ...portArgs,
    ],
    {
      env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
    },
  );
  if (!isLocal(readEnv(CONVEX_ENV)?.CONVEX_DEPLOYMENT))
    stop(`couldn't create a local Convex backend:\n${created.stdout}${created.stderr}`);
  push = true;
}

const app = readEnv(APP_ENV) ?? {};
const site = readEnv(SITE_ENV) ?? {};
// A Clerk publishable key is base64 of "<frontend api host>$"; that host is the JWT issuer.
const clerkKey = app.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? site.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const issuer = clerkKey
  ? `https://${Buffer.from(clerkKey.replace(/^pk_(test|live)_/, ""), "base64")
      .toString()
      .replace(/\$$/, "")}`
  : undefined;
// Without a Clerk key the auth config still needs an issuer before functions push; a placeholder
// keeps the backend, the agent API and the CLI working with sign-in off. A real key replaces it.
const wanted = {
  CLERK_JWT_ISSUER_DOMAIN: issuer ?? PLACEHOLDER_ISSUER,
  KRIYAN_SERVICE_SECRET: site.KRIYAN_SERVICE_SECRET,
};
const names = backendEnvNames();
if (!names) stop("couldn't read the local backend's env vars (`bunx convex env list` in packages/convex)");
for (const [name, value] of Object.entries(wanted)) {
  // Compare values, not names: a regenerated secret or a newly set Clerk key must reach the backend.
  if (names.has(name) && (!value || backendEnvValue(name) === value)) continue;
  if (!value) {
    log("missing", `${name} for the local backend: the dev env files don't provide it`);
    continue;
  }
  if (convex(["env", "set", name, value]).status !== 0) stop(`couldn't set ${name} on the local backend`);
  log(
    "set",
    value === PLACEHOLDER_ISSUER
      ? `${name} on the local backend to a placeholder: no Clerk key, so sign-in is off`
      : `${name} on the local backend`,
  );
  push = true;
}
if (push) {
  const pushed = convex([
    "dev",
    "--once",
    "--codegen",
    "disable",
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
    ...portArgs,
  ]);
  if (pushed.status !== 0)
    stop(`pushing functions to the local backend failed:\n${pushed.stdout}${pushed.stderr}`);
  log("pushed", "functions and schema to the local backend");
}

// 6. Point the app and site at this checkout's backend. Expo and Next read these files over the
// process env, so the files themselves must hold the local URLs.
const backend = readEnv(CONVEX_ENV);
const point = (file, values) => {
  if (existsSync(join(root, file)) && setEnv(file, values).length)
    log("pointed", `${file} at ${backend.CONVEX_URL}`);
};
point(APP_ENV, { EXPO_PUBLIC_CONVEX_URL: backend.CONVEX_URL });
point(SITE_ENV, {
  NEXT_PUBLIC_CONVEX_URL: backend.CONVEX_URL,
  NEXT_PUBLIC_CONVEX_SITE_URL: backend.CONVEX_SITE_URL,
});

// 7. The doctor checks all of the above and prints the summary line.
const doctor = spawnSync(process.execPath, [join(root, "scripts", "doctor.mjs")], { stdio: "inherit" });
process.exit(doctor.status ?? 1);
