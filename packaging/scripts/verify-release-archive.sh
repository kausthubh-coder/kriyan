#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: verify-release-archive.sh RELEASE_ARCHIVE}
"$(dirname "$0")/verify-safe-archive.sh" "${archive}"
listing=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-list.XXXXXX")
trap 'rm -f "${listing}"' EXIT
tar -tzf "${archive}" >"${listing}"
grep -Eq '^(\./)?bin/kriyan-node$' "${listing}" || {
  echo "release archive is missing bin/kriyan-node" >&2
  exit 2
}
grep -Eq '^(\./)?bin/kriyan$' "${listing}" || {
  echo "release archive is missing bin/kriyan" >&2
  exit 2
}
