// Makes a cloud session (Claude Code on the web, Codex Cloud) ready by itself. A cloud VM starts
// from a bare Linux clone: no global skills, no deps, no dev env store, no .claude/skills link.
//
//   Claude: the SessionStart hook in .claude/settings.json runs `node scripts/cloud.mjs`
//   Codex:  the environment's setup script is `CLOUD=1 node scripts/cloud.mjs`
//
// Local sessions don't set CLAUDE_CODE_REMOTE, CODEX_CI or CLOUD, so it exits at once there.
// stdout becomes the session's context, so only my rules and the last line go there; setup's
// output goes to stderr.

import { spawnSync } from "node:child_process";
import { inCloud, root } from "./checkout.mjs";

if (!inCloud) process.exit(0);

const problems = [];
const run = (command, stdout) =>
  spawnSync(command, { cwd: root, shell: true, stdio: ["ignore", stdout, "inherit"] }).status === 0;

// 1. My global skills and rules. Its stdout (the rules) passes through to the session.
if (
  !run(
    "curl -fsSL https://raw.githubusercontent.com/kausthubh-coder/skills/main/cloud/session.sh | bash",
    "inherit",
  )
)
  problems.push("the global skills and rules didn't load");

// 2. Setup: skills link, env files from the cloud environment, deps, ports, this clone's own local
// Convex backend, then the doctor. Its output goes to stderr.
if (!run("node scripts/setup.mjs", process.stderr))
  problems.push("setup or the doctor failed (run bun run doctor)");

// 3. A browser for the e2e scripts. The doctor above already reports when there's none.
const { findBrowser } = await import("./browser.mjs").catch(() => ({ findBrowser: () => null }));
if (!findBrowser() && !run("node node_modules/playwright-core/cli.js install chromium", process.stderr))
  problems.push("no browser for the e2e scripts, and installing Playwright's Chromium failed");

const clerk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? ""
  : " Sign-in is off: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY isn't set.";
console.log(
  problems.length
    ? `cloud: kriyan NOT ready: ${problems.join("; ")}.`
    : `cloud: kriyan ready (deps, ports, skills, local Convex backend, browser).${clerk} See ## Cloud sessions in AGENTS.md.`,
);
