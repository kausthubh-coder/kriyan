#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: install.sh RELEASE_ARCHIVE}
version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
source "$(dirname "$0")/release-path.sh"
opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
state_root=${KRIYAN_STATE_ROOT:-/var/lib/kriyan}
systemd_root=${KRIYAN_SYSTEMD_ROOT:-/etc/systemd/system}
systemctl_cmd=${KRIYAN_SYSTEMCTL:-systemctl}

if [[ ${EUID} -ne 0 ]]; then
  echo "install must run as root" >&2
  exit 2
fi

id kriyan >/dev/null 2>&1 || useradd --system --home "${state_root}" --shell /usr/sbin/nologin kriyan
install -d -o kriyan -g kriyan -m 0700 "${state_root}"
install -d -o root -g kriyan -m 0750 "${etc_root}"
install -d -o root -g root -m 0755 "${opt_root}/releases"
release_dir=$(release_path "${version}")
assert_direct_release_child "${release_dir}"
"$(dirname "$0")/verify-release-archive.sh" "${archive}"
if [[ -e ${release_dir} || -L ${release_dir} ]]; then
  [[ -d ${release_dir} && ! -L ${release_dir} ]] || {
    echo "existing release is not an immutable directory" >&2
    exit 2
  }
  incoming_manifest=$(mktemp "${TMPDIR:-/tmp}/kriyan-incoming-manifest.XXXXXX")
  trap 'rm -f "${incoming_manifest}"' EXIT
  tar -xOzf "${archive}" ./provenance/build.manifest >"${incoming_manifest}"
  cmp -s "${incoming_manifest}" "${release_dir}/provenance/build.manifest" || {
    echo "release identifier already exists with different provenance" >&2
    exit 2
  }
  # shellcheck source=packaging/scripts/provenance-lib.sh
  source "$(dirname "$0")/provenance-lib.sh"
  validate_provenance_manifest \
    "${release_dir}/provenance/build.manifest" \
    "${release_dir}/bin/kriyan-node" "${release_dir}/bin/kriyan"
  rm -f "${incoming_manifest}"
  trap - EXIT
  switch_current_release "${release_dir}"
  printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >"${etc_root}/release.env"
  chown root:kriyan "${etc_root}/release.env"
  chmod 0640 "${etc_root}/release.env"
  install -m 0644 "${release_dir}/packaging/systemd/kriyan-node.service" "${systemd_root}/kriyan-node.service"
  "${systemctl_cmd}" daemon-reload
  echo "release ${version} already verified; current pointer refreshed"
  exit 0
fi
staging_dir="${release_dir}.partial.$$"
assert_direct_release_child "${staging_dir}"
rm -rf "${staging_dir}"
trap 'rm -rf "${staging_dir}"' EXIT
install -d -o root -g root -m 0755 "${staging_dir}"
tar -xzf "${archive}" -C "${staging_dir}"
[[ -x ${staging_dir}/bin/kriyan-node && -x ${staging_dir}/bin/kriyan ]] || {
  echo "standalone binaries missing" >&2
  exit 2
}
mv "${staging_dir}" "${release_dir}"
trap - EXIT
switch_current_release "${release_dir}"
printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >"${etc_root}/release.env"
chown root:kriyan "${etc_root}/release.env"
chmod 0640 "${etc_root}/release.env"
install -m 0644 "${release_dir}/packaging/systemd/kriyan-node.service" "${systemd_root}/kriyan-node.service"
"${systemctl_cmd}" daemon-reload
echo "installed ${version}; add ${etc_root}/node.json before enabling the service"
