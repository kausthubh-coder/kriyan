#!/usr/bin/env bash
set -euo pipefail

output=${1:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY}
node_binary=${2:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY}
cli_binary=${3:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY}
root=$(cd "$(dirname "$0")/../.." && pwd)
temporary="${output}.partial.$$"
binary_staging="${temporary}.bin"
trap 'rm -f "${temporary}"; rm -rf "${binary_staging}"' EXIT

[[ -x ${node_binary} && -x ${cli_binary} ]] || {
  echo "standalone binaries are missing or not executable" >&2
  exit 2
}
install -d -m 0755 "${binary_staging}/bin"
install -m 0755 "${node_binary}" "${binary_staging}/bin/kriyan-node"
install -m 0755 "${cli_binary}" "${binary_staging}/bin/kriyan"

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
  apps packages packaging convex/_generated \
  -C "${binary_staging}" bin/kriyan-node bin/kriyan
tar -tzf "${temporary}" >/dev/null
if tar -tzf "${temporary}" | grep -E '(^|/)(\.env($|\.)|node_modules|transcript\.jsonl|checkpoint\.json)' >/dev/null; then
  echo "release contains a forbidden private path" >&2
  exit 1
fi
mv "${temporary}" "${output}"
rm -rf "${binary_staging}"
trap - EXIT
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${output}" >"${output}.sha256"
else
  shasum -a 256 "${output}" >"${output}.sha256"
fi
echo "release verified: ${output}"
