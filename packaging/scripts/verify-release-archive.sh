#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: verify-release-archive.sh RELEASE_ARCHIVE}
requested_commit=${2:?usage: verify-release-archive.sh RELEASE_ARCHIVE COMMIT [TREE] [FORBIDDEN_LITERAL...]}
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
# shellcheck source=packaging/scripts/provenance-lib.sh
source "${root}/packaging/scripts/provenance-lib.sh"

trusted_identity=${KRIYAN_TRUSTED_IDENTITY_FILE:-}
if [[ -n ${trusted_identity} ]]; then
  [[ -f ${trusted_identity} && ! -L ${trusted_identity} ]] || {
    echo "trusted release identity is missing or unsafe" >&2
    exit 2
  }
  awk -F= '
    BEGIN {
      split("source_commit source_tree source_date_epoch lock_sha256 bun_version", keys, " ")
      for (i in keys) allowed[keys[i]] = 1
    }
    NF != 2 || !allowed[$1] || $2 == "" || seen[$1]++ { bad = 1 }
    END {
      for (key in allowed) if (seen[key] != 1) bad = 1
      exit bad ? 1 : 0
    }
  ' "${trusted_identity}" || {
    echo "trusted release identity is invalid" >&2
    exit 2
  }
  expected_commit=$(manifest_value "${trusted_identity}" source_commit)
  derived_tree=$(manifest_value "${trusted_identity}" source_tree)
  expected_epoch=$(manifest_value "${trusted_identity}" source_date_epoch)
  expected_lock=$(manifest_value "${trusted_identity}" lock_sha256)
  expected_bun=$(manifest_value "${trusted_identity}" bun_version)
else
  repository=${KRIYAN_SOURCE_REPOSITORY:-}
  if [[ -z ${repository} ]]; then
    repository=$(git rev-parse --show-toplevel 2>/dev/null) || {
      echo "trusted Git repository is unavailable" >&2
      exit 2
    }
  fi
  expected_commit=$(git -C "${repository}" rev-parse --verify "${requested_commit}^{commit}" 2>/dev/null) || {
    echo "requested release commit is unavailable in the trusted Git repository" >&2
    exit 2
  }
  derived_tree=$(git -C "${repository}" rev-parse "${expected_commit}^{tree}")
  expected_epoch=$(git -C "${repository}" show -s --format=%ct "${expected_commit}")
  expected_lock=$(git -C "${repository}" show "${expected_commit}:bun.lock" | sha256_file /dev/stdin)
  expected_bun=$(git -C "${repository}" show "${expected_commit}:.bun-version" 2>/dev/null) || {
    echo "trusted exact commit is missing .bun-version toolchain policy" >&2
    exit 2
  }
fi

[[ ${expected_commit} == "${requested_commit}" ]] || {
  echo "trusted release identity does not match requested exact SHA" >&2
  exit 2
}
[[ ${derived_tree} =~ ^[0-9a-f]{40}$ && ${expected_epoch} =~ ^[0-9]+$ &&
   ${expected_lock} =~ ^[0-9a-f]{64}$ && ${expected_bun} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "trusted release identity contains invalid commit policy" >&2
  exit 2
}
[[ -z ${expected_tree} || ${expected_tree} == "${derived_tree}" ]] || {
  echo "caller-supplied tree does not match the trusted commit" >&2
  exit 2
}
expected_tree=${derived_tree}

"$(dirname "$0")/verify-safe-archive.sh" "${archive}"
"$(dirname "$0")/verify-canonical-archive.pl" "${archive}" "${expected_epoch}" >/dev/null
extracted=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-release-verify.XXXXXX")
trap 'rm -rf "${extracted}"' EXIT
tar -xzf "${archive}" -C "${extracted}"

node_binary=${extracted}/bin/kriyan-node
cli_binary=${extracted}/bin/kriyan
manifest=${extracted}/provenance/build.manifest
source_manifest=${extracted}/provenance/source.manifest
require_linux_x64_elf "${node_binary}"
require_linux_x64_elf "${cli_binary}"
"${root}/packaging/scripts/scan-binary-content.sh" "${node_binary}" "${forbidden_literals[@]}"
"${root}/packaging/scripts/scan-binary-content.sh" "${cli_binary}" "${forbidden_literals[@]}"
validate_provenance_manifest "${manifest}" "${node_binary}" "${cli_binary}" \
  "${expected_commit}" "${expected_tree}" "${expected_lock}" "${expected_epoch}" "${expected_bun}"

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
[[ $(sha256_file "${extracted}/bun.lock") == "${expected_lock}" ]] || {
  echo "packaged lockfile hash differs from trusted exact commit" >&2
  exit 2
}
if [[ -n ${KRIYAN_EXPORT_TRUSTED_IDENTITY_FILE:-} ]]; then
  exported_identity=${KRIYAN_EXPORT_TRUSTED_IDENTITY_FILE}
  [[ ! -e ${exported_identity} && ! -L ${exported_identity} ]] || {
    echo "trusted identity export destination already exists" >&2
    exit 2
  }
  umask 077
  {
    printf 'source_commit=%s\n' "${expected_commit}"
    printf 'source_tree=%s\n' "${expected_tree}"
    printf 'source_date_epoch=%s\n' "${expected_epoch}"
    printf 'lock_sha256=%s\n' "${expected_lock}"
    printf 'bun_version=%s\n' "${expected_bun}"
  } >"${exported_identity}.partial.$$"
  chmod 0600 "${exported_identity}.partial.$$"
  mv "${exported_identity}.partial.$$" "${exported_identity}"
fi
echo "release archive provenance, packaged ELFs, content, and canonical metadata passed: ${archive}"
