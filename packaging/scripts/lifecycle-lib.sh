#!/usr/bin/env bash

lifecycle_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=packaging/scripts/release-path.sh
source "${lifecycle_script_dir}/release-path.sh"
# shellcheck source=packaging/scripts/provenance-lib.sh
source "${lifecycle_script_dir}/provenance-lib.sh"

milliseconds_now() {
  local value
  value=$(date +%s%3N 2>/dev/null || true)
  if [[ ${value} =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${value}"
  else
    perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000'
  fi
}

validate_installed_release() {
  local release=$1
  local expected_commit=$2
  if [[ -n ${KRIYAN_VALIDATE_INSTALLED_RELEASE:-} ]]; then
    "${KRIYAN_VALIDATE_INSTALLED_RELEASE}" "${release}" "${expected_commit}"
    return
  fi
  [[ -d ${release} && ! -L ${release} ]] || {
    echo "release is not a valid immutable installation" >&2
    return 2
  }
  [[ -f ${release}/packaging/systemd/kriyan-node.service && ! -L ${release}/packaging/systemd/kriyan-node.service ]] || {
    echo "release systemd unit is missing or invalid" >&2
    return 2
  }
  validate_provenance_manifest \
    "${release}/provenance/build.manifest" \
    "${release}/bin/kriyan-node" "${release}/bin/kriyan" \
    "${expected_commit}"
}

write_release_environment() {
  local version=$1
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local owner=${KRIYAN_RELEASE_ENV_OWNER-root:kriyan}
  local destination="${etc_root}/release.env"
  local temporary="${etc_root}/.release.env.$$"
  validate_release_version "${version}" || return
  if [[ -e ${destination} || -L ${destination} ]]; then
    [[ -f ${destination} && ! -L ${destination} ]] || {
      echo "release environment destination is not a regular file" >&2
      return 2
    }
  fi
  umask 077
  printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >"${temporary}"
  if [[ -n ${owner} ]]; then
    chown "${owner}" "${temporary}"
  fi
  chmod 0640 "${temporary}"
  mv -f "${temporary}" "${destination}"
}

install_release_unit() {
  local release=$1
  local systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
  local destination="${systemd_root}/kriyan-node.service"
  local temporary="${systemd_root}/.kriyan-node.service.$$"
  if [[ -e ${destination} || -L ${destination} ]]; then
    [[ -f ${destination} && ! -L ${destination} ]] || {
      echo "systemd unit destination is not a regular file" >&2
      return 2
    }
  fi
  if ! install -m 0644 "${release}/packaging/systemd/kriyan-node.service" "${temporary}"; then
    rm -f "${temporary}"
    return 1
  fi
  if ! mv -f "${temporary}" "${destination}"; then
    rm -f "${temporary}"
    return 1
  fi
}

activate_release_state() {
  local release=$1
  local version=$2
  local systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
  validate_installed_release "${release}" "${version}"
  switch_current_release "${release}"
  write_release_environment "${version}"
  install_release_unit "${release}"
  "${systemctl_cmd}" daemon-reload
}

snapshot_regular_file() {
  local source=$1
  local backup=$2
  local state=$3
  if [[ -e ${source} || -L ${source} ]]; then
    [[ -f ${source} && ! -L ${source} ]] || {
      echo "transaction state is not a regular file: ${source}" >&2
      return 2
    }
    cp -p "${source}" "${backup}"
    printf 'present\n' >"${state}"
  else
    printf 'absent\n' >"${state}"
  fi
}

restore_regular_file() {
  local destination=$1
  local backup=$2
  local state=$3
  case $(cat "${state}") in
    present)
      cp -p "${backup}" "${destination}.restore.$$"
      mv -f "${destination}.restore.$$" "${destination}"
      ;;
    absent)
      rm -f -- "${destination}"
      ;;
    *)
      echo "transaction snapshot state is invalid" >&2
      return 2
      ;;
  esac
}

snapshot_path() {
  local source=$1
  local backup=$2
  local state=$3
  if [[ -L ${source} ]]; then
    readlink "${source}" >"${backup}"
    printf 'symlink\n' >"${state}"
  elif [[ -f ${source} ]]; then
    cp -p "${source}" "${backup}"
    printf 'regular\n' >"${state}"
  elif [[ -e ${source} ]]; then
    echo "transaction state is not a regular file or symlink: ${source}" >&2
    return 2
  else
    printf 'absent\n' >"${state}"
  fi
}

restore_path() {
  local destination=$1
  local backup=$2
  local state=$3
  if [[ -e ${destination} && ! -f ${destination} && ! -L ${destination} ]]; then
    echo "transaction destination is not replaceable: ${destination}" >&2
    return 2
  fi
  rm -f -- "${destination}"
  case $(cat "${state}") in
    regular)
      cp -p "${backup}" "${destination}.restore.$$"
      mv -f "${destination}.restore.$$" "${destination}"
      ;;
    symlink)
      ln -s "$(cat "${backup}")" "${destination}"
      ;;
    absent)
      ;;
    *)
      echo "transaction snapshot state is invalid" >&2
      return 2
      ;;
  esac
}

snapshot_release_state() {
  local snapshot=$1
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
  mkdir -m 0700 "${snapshot}"
  snapshot_regular_file \
    "${etc_root}/release.env" "${snapshot}/release.env" "${snapshot}/release.env.state"
  snapshot_regular_file \
    "${systemd_root}/kriyan-node.service" \
    "${snapshot}/kriyan-node.service" "${snapshot}/kriyan-node.service.state"
}

process_instance_for_release() {
  local release=$1
  local config=$2
  local health
  if [[ -n ${KRIYAN_PROCESS_HEALTH_READER:-} ]]; then
    health=$("${KRIYAN_PROCESS_HEALTH_READER}" "${release}" "${config}" || true)
  else
    health=$("${release}/bin/kriyan-node" --process-health-config "${config}" || true)
  fi
  health=${health%%$'\t'*}
  [[ -n ${health} ]] || health=none
  printf '%s\n' "${health}"
}

wait_for_release_health() {
  local release=$1
  local config=$2
  local version=$3
  local previous_instance=$4
  local restarted_at=$5
  local wait_script=${KRIYAN_WAIT_FOR_HEALTH:-${lifecycle_script_dir}/wait-for-health.sh}
  "${wait_script}" \
    "${release}/bin/kriyan-node" "${config}" "${version}" \
    "${previous_instance}" "${restarted_at}"
}

restore_release_state() {
  local previous=$1
  local previous_version=$2
  local previous_instance=$3
  local snapshot=$4
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
  local systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}
  local restarted_at
  local status

  switch_current_release "${previous}" || {
    status=$?
    echo "previous release recovery failed at pointer stage (status ${status})" >&2
    return "${status}"
  }
  restore_regular_file \
    "${etc_root}/release.env" "${snapshot}/release.env" "${snapshot}/release.env.state" || {
    status=$?
    echo "previous release recovery failed at environment stage (status ${status})" >&2
    return "${status}"
  }
  restore_regular_file \
    "${systemd_root}/kriyan-node.service" \
    "${snapshot}/kriyan-node.service" "${snapshot}/kriyan-node.service.state" || {
    status=$?
    echo "previous release recovery failed at unit stage (status ${status})" >&2
    return "${status}"
  }
  "${systemctl_cmd}" daemon-reload || {
    status=$?
    echo "previous release recovery failed at daemon-reload stage (status ${status})" >&2
    return "${status}"
  }
  restarted_at=$(milliseconds_now) || {
    status=$?
    echo "previous release recovery failed while recording restart time (status ${status})" >&2
    return "${status}"
  }
  "${systemctl_cmd}" restart kriyan-node || {
    status=$?
    echo "previous release recovery failed at restart stage (status ${status})" >&2
    return "${status}"
  }
  "${systemctl_cmd}" is-active --quiet kriyan-node || {
    status=$?
    echo "previous release recovery failed at active-state stage (status ${status})" >&2
    return "${status}"
  }
  wait_for_release_health \
    "${previous}" "${etc_root}/node.json" "${previous_version}" \
    "${previous_instance}" "${restarted_at}" || {
    status=$?
    echo "previous release recovery failed at health stage (status ${status})" >&2
    return "${status}"
  }
}
