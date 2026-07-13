#!/usr/bin/env bash
set -euo pipefail

version=${1:?usage: rollback.sh VERSION}
source "$(dirname "$0")/release-path.sh"
target=$(release_path "${version}")
assert_direct_release_child "${target}"
[[ -d ${target} ]] || { echo "release not found: ${version}" >&2; exit 2; }
[[ ! -L ${target} && -x ${target}/bin/kriyan-node ]] || {
  echo "release is not a valid immutable installation" >&2
  exit 2
}
current=$(readlink -f /opt/kriyan/current || true)
previous_instance=none
if [[ -n ${current} && -x ${current}/bin/kriyan-node ]]; then
  previous_health=$("${current}/bin/kriyan-node" --process-health-config /etc/kriyan/node.json || true)
  previous_instance=${previous_health%%$'\t'*}
  [[ -n ${previous_instance} ]] || previous_instance=none
fi
switch_current_release "${target}"
printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >/etc/kriyan/release.env
restarted_at=$(date +%s%3N)
systemctl restart kriyan-node
systemctl is-active --quiet kriyan-node
"$(dirname "$0")/wait-for-health.sh" \
  "${target}/bin/kriyan-node" /etc/kriyan/node.json "${version}" \
  "${previous_instance}" "${restarted_at}"
