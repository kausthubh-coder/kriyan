#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/release-path.sh"
opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
current=$(readlink -f "${opt_root}/current" || true)
[[ -n ${current} ]] || { echo "no current release" >&2; exit 2; }
assert_direct_release_child "${current}"
[[ -d ${current} && ! -L ${current} && -x ${current}/bin/kriyan-node ]] || {
  echo "current release is invalid" >&2
  exit 2
}
version=$(basename "${current}")
previous_health=$("${current}/bin/kriyan-node" --process-health-config "${etc_root}/node.json" || true)
previous_instance=${previous_health%%$'\t'*}
[[ -n ${previous_instance} ]] || previous_instance=none
restarted_at=$(date +%s%3N)
"${systemctl_cmd}" restart kriyan-node
"${systemctl_cmd}" is-active --quiet kriyan-node
"$(dirname "$0")/wait-for-health.sh" \
  "${current}/bin/kriyan-node" "${etc_root}/node.json" "${version}" \
  "${previous_instance}" "${restarted_at}"
