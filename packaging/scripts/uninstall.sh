#!/usr/bin/env bash
set -euo pipefail

uninstall_main() {
  local effective_uid=${1:?effective uid is required}
  shift
  local mode=${1:?usage: uninstall.sh --preserve-data|--purge-data}
  [[ ${mode} == --preserve-data || ${mode} == --purge-data ]] || {
    echo "uninstall mode must be --preserve-data or --purge-data" >&2
    return 2
  }
  [[ ${effective_uid} -eq 0 ]] || { echo "uninstall must run as root" >&2; return 2; }

  local opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local state_root=${KRIYAN_STATE_ROOT:-/var/lib/kriyan}
  local systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
  local bin_root=${KRIYAN_BIN_ROOT:-/usr/local/bin}
  local systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}

  for target in "${opt_root}" "${etc_root}" "${state_root}"; do
    [[ ${target} == /* && ${target} != / && ${#target} -ge 6 ]] || {
      echo "refusing unsafe uninstall root" >&2
      return 2
    }
  done
  [[ ${opt_root} != "${etc_root}" && ${opt_root} != "${state_root}" && ${etc_root} != "${state_root}" ]] || {
    echo "uninstall roots must be distinct" >&2
    return 2
  }

  local load_state
  local active_state
  if ! load_state=$("${systemctl_cmd}" show --property=LoadState --value kriyan-node 2>/dev/null); then
    echo "cannot confirm kriyan-node service load state; uninstall aborted" >&2
    return 1
  fi
  case ${load_state} in
    not-found)
      ;;
    loaded|masked)
      "${systemctl_cmd}" disable --now kriyan-node >/dev/null 2>&1 || true
      active_state=$("${systemctl_cmd}" is-active kriyan-node 2>/dev/null || true)
      case ${active_state} in
        inactive|failed)
          ;;
        *)
          echo "kriyan-node service is not confirmed stopped; uninstall aborted" >&2
          return 1
          ;;
      esac
      ;;
    *)
      echo "cannot confirm kriyan-node service is absent or stopped; uninstall aborted" >&2
      return 1
      ;;
  esac
  rm -f -- "${systemd_root}/kriyan-node.service"
  "${systemctl_cmd}" daemon-reload
  if [[ -L ${bin_root}/kriyan || -f ${bin_root}/kriyan ]]; then
    rm -f -- "${bin_root}/kriyan"
  fi
  rm -rf -- "${opt_root}"
  rm -rf -- "${etc_root}"
  if [[ ${mode} == --purge-data ]]; then
    rm -rf -- "${state_root}"
    echo "kriyan uninstalled; data purged"
  else
    echo "kriyan uninstalled; data preserved at ${state_root}"
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  uninstall_main "${EUID}" "$@"
fi
