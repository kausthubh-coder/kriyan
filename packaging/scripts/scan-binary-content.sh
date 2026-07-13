#!/usr/bin/env bash
set -euo pipefail

binary=${1:?usage: scan-binary-content.sh BINARY [FORBIDDEN_LITERAL ...]}
shift
[[ -f ${binary} ]] || { echo "binary not found" >&2; exit 2; }
export LC_ALL=C

for literal in "$@"; do
  [[ -z ${literal} ]] && continue
  if grep -aF -- "${literal}" "${binary}" >/dev/null; then
    echo "binary contains a caller-supplied forbidden build literal" >&2
    exit 1
  fi
done

if grep -aoE '/(private/)?var/folders/|/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|/[.]codex/worktrees/|/(private/)?tmp/kriyan-(isolated|source|build|release|temp)[^/ ]*' "${binary}" \
  | grep -Ev '^/Users/brew/$' >/dev/null; then
  echo "binary contains a private user, worktree, or build-temporary path" >&2
  exit 1
fi

while IFS= read -r variable; do
  case ${variable} in
    *TOKEN*|*SECRET*|*PASSWORD*|*API_KEY*|*PRIVATE_KEY*|*ACCESS_KEY*|*CREDENTIAL*)
      value=${!variable:-}
      [[ ${#value} -ge 8 ]] || continue
      if grep -aF -- "${value}" "${binary}" >/dev/null; then
        echo "binary contains a known secret environment value" >&2
        exit 1
      fi
      ;;
  esac
done < <(compgen -e)
echo "binary content scan passed: ${binary}"
