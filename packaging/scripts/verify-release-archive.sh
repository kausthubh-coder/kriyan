#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: verify-release-archive.sh RELEASE_ARCHIVE}
listing=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-list.XXXXXX")
verbose=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-verbose.XXXXXX")
trap 'rm -f "${listing}" "${verbose}"' EXIT

tar -tzf "${archive}" >"${listing}"
tar -tvzf "${archive}" >"${verbose}"
if awk '
  /^\// || /(^|\/)\.\.($|\/)/ { bad=1 }
  seen[$0]++ > 0 { bad=1 }
  END { exit bad ? 0 : 1 }
' "${listing}"; then
  echo "release archive has unsafe or duplicate paths" >&2
  exit 2
fi
if awk 'substr($0,1,1) ~ /[lh]/ { found=1 } END { exit found ? 0 : 1 }' "${verbose}"; then
  echo "release archive must not contain links" >&2
  exit 2
fi
grep -qx 'bin/kriyan-node' "${listing}" || {
  echo "release archive is missing bin/kriyan-node" >&2
  exit 2
}
grep -qx 'bin/kriyan' "${listing}" || {
  echo "release archive is missing bin/kriyan" >&2
  exit 2
}
