#!/usr/bin/env bash
set -euo pipefail

previous=$(readlink -f /opt/kriyan/current || true)
"$(dirname "$0")/install.sh" "$@"
if ! systemctl restart kriyan-node || ! systemctl is-active --quiet kriyan-node; then
  if [[ -n ${previous} ]]; then
    ln -sfn "${previous}" /opt/kriyan/current
    systemctl restart kriyan-node
  fi
  echo "update failed; previous release restored" >&2
  exit 1
fi
