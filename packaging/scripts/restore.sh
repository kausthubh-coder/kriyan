#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: restore.sh ARCHIVE.tar.gz TARGET_DIRECTORY}
target=${2:?usage: restore.sh ARCHIVE.tar.gz TARGET_DIRECTORY}
[[ ! -L ${target} ]] || { echo "restore target must not be a symlink" >&2; exit 2; }
mkdir -p "${target}"
[[ -d ${target} && -z $(find "${target}" -mindepth 1 -maxdepth 1 -print -quit) ]] || {
  echo "restore target must be an empty directory" >&2
  exit 2
}
"$(dirname "$0")/verify-safe-archive.sh" "${archive}"
tar -xzf "${archive}" -C "${target}"
echo "restored into ${target}; live paths were not modified"
