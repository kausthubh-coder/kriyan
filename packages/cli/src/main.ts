#!/usr/bin/env node
// The `kriyan` command. Runs on Node 20+ (the published bundle) and on Bun (from the repo).

import { run } from "./run.ts";

// KRIYAN_NOW pins the clock, so tests and scripted examples print the same thing every time.
const pinned = process.env.KRIYAN_NOW ? Date.parse(process.env.KRIYAN_NOW) : Number.NaN;

process.exitCode = await run({
  argv: process.argv.slice(2),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  now: () => (Number.isNaN(pinned) ? Date.now() : pinned),
});
