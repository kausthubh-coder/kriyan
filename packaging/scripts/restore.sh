#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: restore.sh ARCHIVE.tar.gz TARGET_DIRECTORY}
target=${2:?usage: restore.sh ARCHIVE.tar.gz TARGET_DIRECTORY}
mkdir -p "${target}"
tar -tzf "${archive}" >/dev/null
tar -xzf "${archive}" -C "${target}"
echo "restored into ${target}; live paths were not modified"
