#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: update.sh RELEASE_ARCHIVE}
version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
source "$(dirname "$0")/release-path.sh"
previous=$(readlink -f /opt/kriyan/current || true)
previous_version=
previous_instance=none
if [[ -n ${previous} ]]; then
  assert_direct_release_child "${previous}"
  [[ ! -L ${previous} && -x ${previous}/bin/kriyan-node ]] || {
    echo "current release is invalid" >&2
    exit 2
  }
  previous_version=$(basename "${previous}")
  previous_health=$("${previous}/bin/kriyan-node" --process-health-config /etc/kriyan/node.json || true)
  previous_instance=${previous_health%%$'\t'*}
  [[ -n ${previous_instance} ]] || previous_instance=none
fi

"$(dirname "$0")/install.sh" "${archive}"
current=$(readlink -f /opt/kriyan/current || true)
restarted_at=$(date +%s%3N)
if ! systemctl restart kriyan-node || \
   ! systemctl is-active --quiet kriyan-node || \
   [[ -z ${current} ]] || \
   ! "$(dirname "$0")/wait-for-health.sh" \
      "${current}/bin/kriyan-node" /etc/kriyan/node.json "${version}" \
      "${previous_instance}" "${restarted_at}"; then
  if [[ -n ${previous} ]]; then
    switch_current_release "${previous}"
    printf 'KRIYAN_RELEASE_VERSION=%s\n' "${previous_version}" >/etc/kriyan/release.env
    systemctl restart kriyan-node
    systemctl is-active --quiet kriyan-node
    rollback_at=$(date +%s%3N)
    "$(dirname "$0")/wait-for-health.sh" \
      "${previous}/bin/kriyan-node" /etc/kriyan/node.json "${previous_version}" \
      "${previous_instance}" "${rollback_at}"
  fi
  echo "update failed; previous release restored" >&2
  exit 1
fi
