#!/usr/bin/env node
// Read-only: is this checkout's Kriyan worth driving? Prints one line per check, exits 1 on a failure.
//   node .agents/skills/verify-kriyan/doctor.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), "utf8") : "");
const ports = Object.fromEntries(
  read(".env.ports")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split("=")),
);
const APP = ports.PORT_APP ?? "8081";
const SITE = ports.PORT_SITE ?? "3000";
let failed = false;
const report = (ok, label, fix = "") => {
  if (ok === false) failed = true;
  console.log(`${ok === true ? "ok  " : ok === false ? "FAIL" : "warn"}  ${label}${ok === true ? "" : fix ? `: ${fix}` : ""}`);
};

const deployment = /^CONVEX_DEPLOYMENT=(.*)$/m.exec(read("packages/convex/.env.local"))?.[1]?.trim() ?? "";
report(/^(anonymous|local):/.test(deployment), `Convex deployment ${deployment || "(none)"}`, "run `bun run setup` for this checkout's own backend; never drive a shared or prod one");

// The first request to a dev server compiles the page, so allow it a while.
const answers = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(30000) })).status < 500;
  } catch {
    return false;
  }
};
const log = read(".artifacts/dev.log");
report(await answers(`http://localhost:${APP}/today`), `app on :${APP}`, "start `bun run dev` (see SKILL.md Launch)");
report(await answers(`http://localhost:${SITE}/`), `site on :${SITE}`, "start `bun run dev`");
report(/Convex functions ready/.test(log), "convex dev pushed functions", "no 'Convex functions ready' in .artifacts/dev.log");
const lastPush = log.lastIndexOf("Convex functions ready");
const lastError = Math.max(log.lastIndexOf("✖"), log.lastIndexOf("Error:"));
report(lastError < lastPush || lastError === -1 ? true : null, "no convex error after the last push", "read the end of .artifacts/dev.log");

report(existsSync(new URL(".artifacts/app/auth-state.json", root)) || null, "saved web sign-in", "the first e2e script signs in");
report(existsSync(new URL(".artifacts/app/user.json", root)) || null, "seeded test user", "run `node apps/app/e2e/seed.mjs`");

const adb = `${process.env.ANDROID_HOME ?? "C:/Users/kaust/scoop/apps/android-clt/current"}/platform-tools/adb.exe`;
try {
  const devices = execFileSync(adb, ["devices"], { encoding: "utf8" });
  const online = /emulator-\d+\s+device/.test(devices);
  report(online || null, "Android emulator online", "only needed for Android; see SKILL.md Launch");
  if (online) {
    const pkgs = execFileSync(adb, ["shell", "pm", "list", "packages", "app.kriyan"], { encoding: "utf8" });
    report(/app\.kriyan/.test(pkgs) || null, "dev build app.kriyan installed", "see features/android.md");
  }
} catch {
  report(null, "adb", `not found at ${adb}`);
}

console.log(failed ? "\nNot ready." : "\nReady.");
process.exit(failed ? 1 : 0);
