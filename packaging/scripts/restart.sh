#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/release-path.sh"
# shellcheck source=packaging/scripts/lifecycle-lib.sh
source "$(dirname "$0")/lifecycle-lib.sh"
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
validate_installed_release "${current}" "${version}"
previous_instance=$(process_instance_for_release "${current}" "${etc_root}/node.json")
restarted_at=$(milliseconds_now)
"${systemctl_cmd}" restart kriyan-node
"${systemctl_cmd}" is-active --quiet kriyan-node
wait_for_release_health \
  "${current}" "${etc_root}/node.json" "${version}" \
  "${previous_instance}" "${restarted_at}"
