#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
spec=$(mktemp "${TMPDIR:-/tmp}/kriyan-function-spec.XXXXXX.json")
trap 'rm -f "${spec}"' EXIT

cd "${root}"
bunx convex function-spec >"${spec}"
bun scripts/assert-convex-function-spec.ts "${spec}"
