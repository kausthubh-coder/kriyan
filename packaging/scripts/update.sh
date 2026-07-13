#!/usr/bin/env bash
set -euo pipefail

previous=$(readlink -f /opt/kriyan/current || true)
if [[ -n ${previous} ]]; then
  source "$(dirname "$0")/release-path.sh"
  assert_direct_release_child "${previous}"
  [[ ! -L ${previous} && -x ${previous}/bin/kriyan-node ]] || {
    echo "current release is invalid" >&2
    exit 2
  }
fi
"$(dirname "$0")/install.sh" "$@"
current=$(readlink -f /opt/kriyan/current || true)
if ! systemctl restart kriyan-node || \
   ! systemctl is-active --quiet kriyan-node || \
   [[ -z ${current} ]] || \
   ! "${current}/bin/kriyan-node" --health-config /etc/kriyan/node.json; then
  if [[ -n ${previous} ]]; then
    switch_current_release "${previous}"
    systemctl restart kriyan-node
    systemctl is-active --quiet kriyan-node
    "${previous}/bin/kriyan-node" --health-config /etc/kriyan/node.json
  fi
  echo "update failed; previous release restored" >&2
  exit 1
fi
