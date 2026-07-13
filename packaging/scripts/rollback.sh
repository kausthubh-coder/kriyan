#!/usr/bin/env bash
set -euo pipefail

version=${1:?usage: rollback.sh VERSION}
source "$(dirname "$0")/release-path.sh"
# shellcheck source=packaging/scripts/lifecycle-lib.sh
source "$(dirname "$0")/lifecycle-lib.sh"
opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
target=$(release_path "${version}")
assert_direct_release_child "${target}"
[[ -d ${target} ]] || { echo "release not found: ${version}" >&2; exit 2; }
validate_installed_release "${target}" "${version}"
current=$(readlink -f "${opt_root}/current" || true)
[[ -n ${current} ]] || { echo "rollback requires an existing current release" >&2; exit 2; }
assert_direct_release_child "${current}"
previous_version=$(basename "${current}")
validate_installed_release "${current}" "${previous_version}"
previous_instance=$(process_instance_for_release "${current}" "${etc_root}/node.json")
transaction=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-rollback-transaction.XXXXXX")
trap 'rm -rf "${transaction}"' EXIT
snapshot_release_state "${transaction}/state"

set +e
(
  set -e
  activate_release_state "${target}" "${version}"
  restarted_at=$(milliseconds_now)
  "${systemctl_cmd}" restart kriyan-node
  "${systemctl_cmd}" is-active --quiet kriyan-node
  wait_for_release_health \
    "${target}" "${etc_root}/node.json" "${version}" \
    "${previous_instance}" "${restarted_at}"
)
rollback_status=$?
set -e
if [[ ${rollback_status} -ne 0 ]]; then
  if restore_release_state \
    "${current}" "${previous_version}" "${previous_instance}" "${transaction}/state"; then
    echo "rollback failed; complete previous release state restored and healthy" >&2
  else
    echo "rollback failed; previous release recovery also failed" >&2
  fi
  exit 1
fi
