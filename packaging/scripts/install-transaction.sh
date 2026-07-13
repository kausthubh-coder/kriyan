#!/usr/bin/env bash
set -euo pipefail

transaction_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=packaging/scripts/lifecycle-lib.sh
source "${transaction_script_dir}/lifecycle-lib.sh"

service_enabled_state() {
  local systemctl_cmd=$1
  local status
  set +e
  "${systemctl_cmd}" is-enabled --quiet kriyan-node
  status=$?
  set -e
  case ${status} in
    0) printf '1\n' ;;
    1) printf '0\n' ;;
    *) echo "systemctl is-enabled returned unexpected status ${status}" >&2; return 2 ;;
  esac
}

service_active_state() {
  local systemctl_cmd=$1
  local status
  set +e
  "${systemctl_cmd}" is-active --quiet kriyan-node
  status=$?
  set -e
  case ${status} in
    0) printf '1\n' ;;
    3|4) printf '0\n' ;;
    *) echo "systemctl is-active returned unexpected status ${status}" >&2; return 2 ;;
  esac
}

install_transaction_main() {
  local effective_uid=${1:?effective uid is required}
  shift
  local archive=${1:?usage: install-transaction.sh RELEASE_ARCHIVE CONFIG}
  local source_config=${2:?usage: install-transaction.sh RELEASE_ARCHIVE CONFIG}
  local version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
  local opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
  local bin_root=${KRIYAN_BIN_ROOT:-/usr/local/bin}
  local config=${etc_root}/node.json
  local command_link=${bin_root}/kriyan
  local current=${opt_root}/current
  local target
  local previous=
  local previous_version=
  local previous_instance=none
  local prior_enabled=0
  local prior_active=0
  local target_existed=0
  local systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
  local install_script=${KRIYAN_INSTALL_SCRIPT:-${transaction_script_dir}/install.sh}
  local lock=${KRIYAN_INSTALL_LOCK:-/var/lock/kriyan-install.lock}
  local snapshot=
  local restarted_at
  local primary_status

  [[ ${effective_uid} -eq 0 ]] || {
    echo "install transaction must run as root" >&2
    return 2
  }
  if ! mkdir -m 0700 "${lock}" 2>/dev/null; then
    echo "another install transaction holds ${lock}" >&2
    return 75
  fi
  install_transaction_cleanup() {
    [[ -z ${snapshot} ]] || rm -rf -- "${snapshot}"
    rmdir "${lock}" >/dev/null 2>&1 || true
  }
  trap install_transaction_cleanup RETURN
  validate_release_version "${version}"
  [[ -f ${source_config} && ! -L ${source_config} ]] || {
    echo "install config must be a regular file" >&2
    return 2
  }
  target=$(release_path "${version}")
  assert_direct_release_child "${target}"
  if [[ -L ${current} ]]; then
    previous=$(readlink -f "${current}")
    assert_direct_release_child "${previous}"
    previous_version=$(basename "${previous}")
    validate_installed_release "${previous}" "${previous_version}"
  elif [[ -e ${current} ]]; then
    echo "current release pointer is not a symlink" >&2
    return 2
  fi
  if [[ -e ${target} || -L ${target} ]]; then
    target_existed=1
  fi
  if [[ -n ${previous} && -f ${config} && ! -L ${config} ]]; then
    previous_instance=$(process_instance_for_release "${previous}" "${config}")
  fi
  prior_enabled=$(service_enabled_state "${systemctl_cmd}")
  prior_active=$(service_active_state "${systemctl_cmd}")
  if [[ ${prior_active} -eq 1 && ( -z ${previous} || ! -f ${config} || -L ${config} ) ]]; then
    echo "active prior service does not have a valid release and config" >&2
    return 2
  fi
  if [[ ${prior_active} -eq 1 && ${previous_instance} == none ]]; then
    echo "active prior service health could not be validated before mutation" >&2
    return 2
  fi

  snapshot=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-install-transaction.XXXXXX")
  mkdir -m 0700 "${snapshot}/release-state"
  snapshot_regular_file "${etc_root}/release.env" \
    "${snapshot}/release-state/release.env" "${snapshot}/release-state/release.env.state"
  snapshot_regular_file "${systemd_root}/kriyan-node.service" \
    "${snapshot}/release-state/kriyan-node.service" "${snapshot}/release-state/kriyan-node.service.state"
  snapshot_regular_file "${config}" "${snapshot}/node.json" "${snapshot}/node.json.state"
  snapshot_path "${command_link}" "${snapshot}/command-link" "${snapshot}/command-link.state"
  snapshot_path "${current}" "${snapshot}/current" "${snapshot}/current.state"

  set +e
  (
    set -euo pipefail
    KRIYAN_VERSION="${version}" "${install_script}" "${archive}"
    install -d -o root -g kriyan -m 0750 "${etc_root}"
    install -o root -g kriyan -m 0640 "${source_config}" "${config}.partial.$$"
    mv -f "${config}.partial.$$" "${config}"
    install -d -o root -g root -m 0755 "${bin_root}"
    if [[ -e ${command_link} && ! -f ${command_link} && ! -L ${command_link} ]]; then
      echo "command path is not replaceable" >&2
      exit 2
    fi
    ln -sfn "${current}/bin/kriyan" "${command_link}"
    "${systemctl_cmd}" enable kriyan-node
    restarted_at=$(milliseconds_now)
    "${systemctl_cmd}" restart kriyan-node
    "${systemctl_cmd}" is-active --quiet kriyan-node
    wait_for_release_health "${target}" "${config}" "${version}" \
      "${previous_instance}" "${restarted_at}"
  )
  primary_status=$?
  set -e
  if [[ ${primary_status} -eq 0 ]]; then
    echo "install transaction completed for ${version}"
    return 0
  fi

  echo "install transaction failed (status ${primary_status}); restoring prior state" >&2
  local recovery_status=0
  if [[ ${prior_active} -eq 0 ]]; then
    "${systemctl_cmd}" stop kriyan-node >/dev/null 2>&1 || true
  fi
  if [[ ${prior_enabled} -eq 0 ]]; then
    "${systemctl_cmd}" disable kriyan-node >/dev/null 2>&1 || true
  fi
  rm -f -- "${config}.partial.$$"
  restore_regular_file "${config}" "${snapshot}/node.json" "${snapshot}/node.json.state" || recovery_status=1
  restore_path "${command_link}" "${snapshot}/command-link" "${snapshot}/command-link.state" || recovery_status=1
  restore_path "${current}" "${snapshot}/current" "${snapshot}/current.state" || recovery_status=1
  restore_regular_file "${etc_root}/release.env" \
    "${snapshot}/release-state/release.env" \
    "${snapshot}/release-state/release.env.state" || recovery_status=1
  restore_regular_file "${systemd_root}/kriyan-node.service" \
    "${snapshot}/release-state/kriyan-node.service" \
    "${snapshot}/release-state/kriyan-node.service.state" || recovery_status=1
  "${systemctl_cmd}" daemon-reload || recovery_status=1
  if [[ ${prior_enabled} -eq 1 ]]; then
    "${systemctl_cmd}" enable kriyan-node || recovery_status=1
  fi
  [[ $(service_enabled_state "${systemctl_cmd}" 2>/dev/null || printf unexpected) == "${prior_enabled}" ]] || recovery_status=1
  if [[ ${prior_active} -eq 1 ]]; then
    restarted_at=0
    if ! restarted_at=$(milliseconds_now); then
      recovery_status=1
      restarted_at=0
    fi
    "${systemctl_cmd}" restart kriyan-node || recovery_status=1
    "${systemctl_cmd}" is-active --quiet kriyan-node || recovery_status=1
    if [[ -n ${previous} && -f ${config} && ! -L ${config} ]]; then
      wait_for_release_health "${previous}" "${config}" "${previous_version}" \
        "${previous_instance}" "${restarted_at}" || recovery_status=1
    else
      recovery_status=1
    fi
  elif [[ $(service_active_state "${systemctl_cmd}" 2>/dev/null || printf unexpected) != 0 ]]; then
    recovery_status=1
  fi
  if [[ ${target_existed} -eq 0 && ${target} != "${previous}" ]]; then
    rm -rf -- "${target}" || recovery_status=1
  fi
  if [[ ${recovery_status} -ne 0 ]]; then
    echo "install transaction recovery failed; prior health is not proven" >&2
    return 70
  fi
  if [[ -n ${previous} ]]; then
    echo "install transaction restored the prior healthy release ${previous_version}" >&2
  else
    echo "install transaction removed the failed fresh installation" >&2
  fi
  return "${primary_status}"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  install_transaction_main "${EUID}" "$@"
fi
