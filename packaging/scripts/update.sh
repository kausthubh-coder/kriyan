#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: update.sh RELEASE_ARCHIVE}
version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
source "$(dirname "$0")/release-path.sh"
# shellcheck source=packaging/scripts/lifecycle-lib.sh
source "$(dirname "$0")/lifecycle-lib.sh"
opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
install_script=${KRIYAN_INSTALL_SCRIPT:-$(dirname "$0")/install.sh}
previous=$(readlink -f "${opt_root}/current" || true)
[[ -n ${previous} ]] || { echo "update requires an existing current release" >&2; exit 2; }
assert_direct_release_child "${previous}"
previous_version=$(basename "${previous}")
validate_installed_release "${previous}" "${previous_version}"
previous_instance=$(process_instance_for_release "${previous}" "${etc_root}/node.json")
transaction=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-update-transaction.XXXXXX")
trap 'rm -rf "${transaction}"' EXIT
snapshot_release_state "${transaction}/state"

set +e
(
  set -e
  "${install_script}" "${archive}"
  current=$(readlink -f "${opt_root}/current" || true)
  [[ -n ${current} ]]
  assert_direct_release_child "${current}"
  [[ $(basename "${current}") == "${version}" ]]
  validate_installed_release "${current}" "${version}"
  restarted_at=$(milliseconds_now)
  "${systemctl_cmd}" restart kriyan-node
  "${systemctl_cmd}" is-active --quiet kriyan-node
  wait_for_release_health \
    "${current}" "${etc_root}/node.json" "${version}" \
    "${previous_instance}" "${restarted_at}"
)
update_status=$?
set -e
if [[ ${update_status} -ne 0 ]]; then
  if restore_release_state \
    "${previous}" "${previous_version}" "${previous_instance}" "${transaction}/state"; then
    echo "update failed; complete previous release state restored and healthy" >&2
  else
    echo "update failed; previous release recovery also failed" >&2
  fi
  exit 1
fi
