#!/usr/bin/env bash
set -euo pipefail

binary=${1:?usage: scan-binary-content.sh BINARY [FORBIDDEN_LITERAL ...]}
shift
[[ -f ${binary} ]] || { echo "binary not found" >&2; exit 2; }
strings_file=$(mktemp "${TMPDIR:-/tmp}/kriyan-binary-strings.XXXXXX")
trap 'rm -f "${strings_file}"' EXIT
strings "${binary}" >"${strings_file}"

for literal in "$@"; do
  [[ -z ${literal} ]] && continue
  if grep -F -- "${literal}" "${strings_file}" >/dev/null; then
    echo "binary contains forbidden build literal: ${literal}" >&2
    exit 1
  fi
done

if grep -E '/Users/[^/]+/|/home/[^/]+/|\.codex/worktrees/|/private/tmp/kriyan-|/tmp/kriyan-(isolated|build|source)-' "${strings_file}" >/dev/null; then
  echo "binary contains a private user, worktree, or build-temporary path" >&2
  exit 1
fi
echo "binary content scan passed: ${binary}"
