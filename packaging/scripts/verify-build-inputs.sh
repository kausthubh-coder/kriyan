#!/usr/bin/env bash
set -euo pipefail

node_binary=${1:?usage: verify-build-inputs.sh NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
cli_binary=${2:?usage: verify-build-inputs.sh NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
sha=${3:?usage: verify-build-inputs.sh NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
provenance=${4:?usage: verify-build-inputs.sh NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
tree=$(git rev-parse "${commit}^{tree}")
epoch=$(git show -s --format=%ct "${commit}")

# shellcheck source=packaging/scripts/provenance-lib.sh
source "${root}/packaging/scripts/provenance-lib.sh"
lock_hash=$(git show "${commit}:bun.lock" | sha256_file /dev/stdin)
trusted_bun=$(git show "${commit}:.bun-version" 2>/dev/null) || {
  echo "exact commit is missing .bun-version toolchain policy" >&2
  exit 2
}
[[ ${trusted_bun} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $(bun --version) == "${trusted_bun}" ]] || {
  echo "active Bun does not match the trusted commit toolchain policy" >&2
  exit 2
}
validate_provenance_manifest "${provenance}" "${node_binary}" "${cli_binary}" \
  "${commit}" "${tree}" "${lock_hash}" "${epoch}" "${trusted_bun}"
echo "release inputs match exact commit, tree, toolchain, and ELF hashes: ${commit}"
