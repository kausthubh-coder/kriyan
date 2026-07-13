#!/usr/bin/env bun
import { runCli } from './cli'

if (import.meta.main) {
  process.exitCode = await runCli(Bun.argv.slice(2))
}
