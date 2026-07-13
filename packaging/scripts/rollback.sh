#!/usr/bin/env bash
set -euo pipefail

version=${1:?usage: rollback.sh VERSION}
target="/opt/kriyan/releases/${version}"
[[ -d ${target} ]] || { echo "release not found: ${version}" >&2; exit 2; }
ln -sfn "${target}" /opt/kriyan/current
systemctl restart kriyan-node
systemctl is-active --quiet kriyan-node
