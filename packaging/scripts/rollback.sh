#!/usr/bin/env bash
set -euo pipefail

version=${1:?usage: rollback.sh VERSION}
source "$(dirname "$0")/release-path.sh"
opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
target=$(release_path "${version}")
assert_direct_release_child "${target}"
[[ -d ${target} ]] || { echo "release not found: ${version}" >&2; exit 2; }
[[ ! -L ${target} && -x ${target}/bin/kriyan-node ]] || {
  echo "release is not a valid immutable installation" >&2
  exit 2
}
current=$(readlink -f "${opt_root}/current" || true)
previous_instance=none
if [[ -n ${current} && -x ${current}/bin/kriyan-node ]]; then
  previous_health=$("${current}/bin/kriyan-node" --process-health-config "${etc_root}/node.json" || true)
  previous_instance=${previous_health%%$'\t'*}
  [[ -n ${previous_instance} ]] || previous_instance=none
fi
switch_current_release "${target}"
printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >"${etc_root}/release.env"
restarted_at=$(date +%s%3N)
"${systemctl_cmd}" restart kriyan-node
"${systemctl_cmd}" is-active --quiet kriyan-node
"$(dirname "$0")/wait-for-health.sh" \
  "${target}/bin/kriyan-node" "${etc_root}/node.json" "${version}" \
  "${previous_instance}" "${restarted_at}"
