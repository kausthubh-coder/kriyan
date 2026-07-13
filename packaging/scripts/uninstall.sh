#!/usr/bin/env bash
set -euo pipefail

mode=${1:?usage: uninstall.sh --preserve-data|--purge-data}
[[ ${mode} == --preserve-data || ${mode} == --purge-data ]] || {
  echo "uninstall mode must be --preserve-data or --purge-data" >&2
  exit 2
}
[[ ${EUID} -eq 0 ]] || { echo "uninstall must run as root" >&2; exit 2; }

opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
state_root=${KRIYAN_STATE_ROOT:-/var/lib/kriyan}
systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
bin_root=${KRIYAN_BIN_ROOT:-/usr/local/bin}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}

for target in "${opt_root}" "${etc_root}" "${state_root}"; do
  [[ ${target} == /* && ${target} != / && ${#target} -ge 6 ]] || {
    echo "refusing unsafe uninstall root" >&2
    exit 2
  }
done
[[ ${opt_root} != "${etc_root}" && ${opt_root} != "${state_root}" && ${etc_root} != "${state_root}" ]] || {
  echo "uninstall roots must be distinct" >&2
  exit 2
}

"${systemctl_cmd}" disable --now kriyan-node >/dev/null 2>&1 || true
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
