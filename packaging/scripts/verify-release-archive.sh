#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: verify-release-archive.sh RELEASE_ARCHIVE}
expected_commit=${2:-}
expected_tree=${3:-}
if [[ $# -ge 3 ]]; then
  shift 3
else
  shift "$#"
fi
forbidden_literals=("")
for literal in "$@"; do
  forbidden_literals+=("${literal}")
done
root=$(cd "$(dirname "$0")/../.." && pwd -P)
"$(dirname "$0")/verify-safe-archive.sh" "${archive}"
metadata=$("$(dirname "$0")/verify-canonical-archive.pl" "${archive}")
archive_epoch=${metadata#source_date_epoch=}
extracted=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-release-verify.XXXXXX")
trap 'rm -rf "${extracted}"' EXIT
tar -xzf "${archive}" -C "${extracted}"

node_binary=${extracted}/bin/kriyan-node
cli_binary=${extracted}/bin/kriyan
manifest=${extracted}/provenance/build.manifest
source_manifest=${extracted}/provenance/source.manifest
# shellcheck source=packaging/scripts/provenance-lib.sh
source "${root}/packaging/scripts/provenance-lib.sh"
require_linux_x64_elf "${node_binary}"
require_linux_x64_elf "${cli_binary}"
"${root}/packaging/scripts/scan-binary-content.sh" "${node_binary}" "${forbidden_literals[@]}"
"${root}/packaging/scripts/scan-binary-content.sh" "${cli_binary}" "${forbidden_literals[@]}"
validate_provenance_manifest "${manifest}" "${node_binary}" "${cli_binary}" \
  "${expected_commit}" "${expected_tree}" "" "${archive_epoch}" ""

awk -F= '
  ($1 != "source_commit" && $1 != "source_tree") || NF != 2 || $2 == "" || seen[$1]++ { bad = 1 }
  END { exit bad || seen["source_commit"] != 1 || seen["source_tree"] != 1 ? 1 : 0 }
' "${source_manifest}" || {
  echo "source provenance manifest is invalid or duplicated" >&2
  exit 2
}
[[ $(manifest_value "${source_manifest}" source_commit) == "$(manifest_value "${manifest}" source_commit)" ]] || {
  echo "packaged source and build commit provenance differ" >&2
  exit 2
}
[[ $(manifest_value "${source_manifest}" source_tree) == "$(manifest_value "${manifest}" source_tree)" ]] || {
  echo "packaged source and build tree provenance differ" >&2
  exit 2
}
[[ $(sha256_file "${extracted}/bun.lock") == "$(manifest_value "${manifest}" lock_sha256)" ]] || {
  echo "packaged lockfile hash differs from build provenance" >&2
  exit 2
}
echo "release archive provenance, packaged ELFs, content, and canonical metadata passed: ${archive}"
