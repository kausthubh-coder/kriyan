#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: verify-safe-archive.sh ARCHIVE}
listing=$(mktemp "${TMPDIR:-/tmp}/kriyan-archive-list.XXXXXX")
verbose=$(mktemp "${TMPDIR:-/tmp}/kriyan-archive-verbose.XXXXXX")
trap 'rm -f "${listing}" "${verbose}"' EXIT

tar -tzf "${archive}" >"${listing}"
tar -tvzf "${archive}" >"${verbose}"
if awk '
  /^\// || /(^|\/)\.\.($|\/)/ { bad=1 }
  seen[$0]++ > 0 { bad=1 }
  END { exit bad ? 0 : 1 }
' "${listing}"; then
  echo "archive has unsafe or duplicate paths" >&2
  exit 2
fi
if awk 'substr($0,1,1) !~ /[-d]/ { bad=1 } END { exit bad ? 0 : 1 }' "${verbose}"; then
  echo "archive may contain only regular files and directories" >&2
  exit 2
fi
