// Prepares a fresh checkout or worktree: installs dependencies, copies the dev env files,
// and picks free ports so parallel worktrees don't collide.
// Usage: bun run setup
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const ENV_FILES = ["packages/convex/.env.local", "apps/app/.env.local", "apps/site/.env.local"];
// Dev secrets live outside the repo and outside OneDrive. See AGENTS.md, "Setup".
const store = process.env.KRIYAN_ENV_DIR ?? join(homedir(), ".kriyan", "dev-env");

console.log("Installing dependencies...");
execSync("bun install", { cwd: root, stdio: "inherit" });

for (const file of ENV_FILES) {
  const target = join(root, file);
  const source = join(store, file);
  if (existsSync(target)) console.log(`kept      ${file}`);
  else if (existsSync(source)) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`copied    ${file}`);
  } else console.log(`missing   ${file} (not in ${store}; see AGENTS.md, Setup)`);
}

// Claude Code reads .claude/skills, Codex reads .agents/skills: one folder, linked.
const claudeSkills = join(root, ".claude", "skills");
if (!existsSync(claudeSkills)) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  symlinkSync(join(root, ".agents", "skills"), claudeSkills, "junction");
  console.log("linked    .claude/skills -> .agents/skills");
}

function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
async function pick(start) {
  for (let port = start; port < start + 100; port++) if (await free(port)) return port;
  throw new Error(`No free port from ${start}`);
}

const portsFile = join(root, ".env.ports");
if (!existsSync(portsFile)) {
  const app = await pick(8081);
  const site = await pick(3000);
  writeFileSync(portsFile, `PORT_APP=${app}\nPORT_SITE=${site}\n`);
  console.log(`ports     app ${app}, site ${site} (.env.ports)`);
} else console.log(`ports     ${readFileSync(portsFile, "utf8").trim().replace(/\n/g, ", ")}`);

console.log("\nDone. Run `bun run doctor`, then `bun run dev`.");
