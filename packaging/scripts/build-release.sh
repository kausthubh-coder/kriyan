#!/usr/bin/env bash
set -euo pipefail

output=${1:?usage: build-release.sh OUTPUT.tar.gz}
root=$(cd "$(dirname "$0")/../.." && pwd)
temporary="${output}.partial.$$"
trap 'rm -f "${temporary}"' EXIT

cd "${root}"
tar \
  --exclude=.git \
  --exclude=node_modules \
  --exclude='**/node_modules' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='.artifacts' \
  --exclude='.sandbox' \
  -czf "${temporary}" \
  AGENTS.md package.json bun.lock tsconfig.json tsconfig.node.json \
  apps packages packaging convex/_generated
tar -tzf "${temporary}" >/dev/null
if tar -tzf "${temporary}" | grep -E '(^|/)(\.env($|\.)|node_modules|transcript\.jsonl|checkpoint\.json)' >/dev/null; then
  echo "release contains a forbidden private path" >&2
  exit 1
fi
mv "${temporary}" "${output}"
trap - EXIT
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${output}" >"${output}.sha256"
else
  shasum -a 256 "${output}" >"${output}.sha256"
fi
echo "release verified: ${output}"
