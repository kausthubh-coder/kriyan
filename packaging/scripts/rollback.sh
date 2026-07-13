#!/usr/bin/env bash
set -euo pipefail

version=${1:?usage: rollback.sh VERSION}
source "$(dirname "$0")/release-path.sh"
target=$(release_path "${version}")
assert_direct_release_child "${target}"
[[ -d ${target} ]] || { echo "release not found: ${version}" >&2; exit 2; }
[[ ! -L ${target} && -x ${target}/bin/kriyan-node ]] || {
  echo "release is not a valid immutable installation" >&2
  exit 2
}
switch_current_release "${target}"
systemctl restart kriyan-node
systemctl is-active --quiet kriyan-node
"${target}/bin/kriyan-node" --health-config /etc/kriyan/node.json
