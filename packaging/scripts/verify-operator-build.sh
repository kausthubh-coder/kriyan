#!/usr/bin/env bash
set -euo pipefail

binary=${1:?usage: verify-operator-build.sh BINARY SHA PROVENANCE_MANIFEST}
sha=${2:?usage: verify-operator-build.sh BINARY SHA PROVENANCE_MANIFEST}
manifest=${3:?usage: verify-operator-build.sh BINARY SHA PROVENANCE_MANIFEST}
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
tree=$(git rev-parse "${commit}^{tree}")
epoch=$(git show -s --format=%ct "${commit}")
# shellcheck source=packaging/scripts/provenance-lib.sh
source "${root}/packaging/scripts/provenance-lib.sh"
require_darwin_arm64_macho "${binary}"

awk -F= '
  BEGIN {
    split("manifest_version source_commit source_tree source_date_epoch bun_version target lock_sha256 cli_sha256 source_method bundle_entry normalized_build_prefix", keys, " ")
    for (i in keys) allowed[keys[i]] = 1
  }
  NF != 2 || !allowed[$1] || $2 == "" || seen[$1]++ { bad = 1 }
  END {
    for (key in allowed) if (seen[key] != 1) bad = 1
    exit bad ? 1 : 0
  }
' "${manifest}" || { echo "operator provenance manifest is invalid" >&2; exit 2; }

lock_hash=$(git show "${commit}:bun.lock" | sha256_file /dev/stdin)
trusted_bun=$(git show "${commit}:.bun-version" 2>/dev/null) || {
  echo "exact commit is missing .bun-version toolchain policy" >&2
  exit 2
}
[[ ${trusted_bun} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $(bun --version) == "${trusted_bun}" ]]
[[ $(manifest_value "${manifest}" manifest_version) == 1 ]]
[[ $(manifest_value "${manifest}" source_commit) == "${commit}" ]]
[[ $(manifest_value "${manifest}" source_tree) == "${tree}" ]]
[[ $(manifest_value "${manifest}" source_date_epoch) == "${epoch}" ]]
[[ $(manifest_value "${manifest}" bun_version) == "${trusted_bun}" ]]
[[ $(manifest_value "${manifest}" target) == bun-darwin-arm64 ]]
[[ $(manifest_value "${manifest}" lock_sha256) == "${lock_hash}" ]]
[[ $(manifest_value "${manifest}" cli_sha256) == "$(sha256_file "${binary}")" ]]
[[ $(manifest_value "${manifest}" source_method) == git-archive-file ]]
[[ $(manifest_value "${manifest}" bundle_entry) == operator.bundle.normalized.js ]]
[[ $(manifest_value "${manifest}" normalized_build_prefix) == /opt/kriyan/build ]]
echo "operator CLI matches exact commit, tree, toolchain, target, and hash: ${commit}"
