#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: install.sh RELEASE_ARCHIVE}
version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
source "$(dirname "$0")/release-path.sh"

if [[ ${EUID} -ne 0 ]]; then
  echo "install must run as root" >&2
  exit 2
fi

id kriyan >/dev/null 2>&1 || useradd --system --home /var/lib/kriyan --shell /usr/sbin/nologin kriyan
install -d -o kriyan -g kriyan -m 0700 /var/lib/kriyan
install -d -o root -g kriyan -m 0750 /etc/kriyan
install -d -o root -g root -m 0755 /opt/kriyan/releases
release_dir=$(release_path "${version}")
assert_direct_release_child "${release_dir}"
[[ ! -e ${release_dir} && ! -L ${release_dir} ]] || {
  echo "release already exists; immutable releases are never replaced" >&2
  exit 2
}
staging_dir="${release_dir}.partial.$$"
assert_direct_release_child "${staging_dir}"
rm -rf "${staging_dir}"
trap 'rm -rf "${staging_dir}"' EXIT
install -d -o root -g root -m 0755 "${staging_dir}"
"$(dirname "$0")/verify-release-archive.sh" "${archive}"
tar -xzf "${archive}" -C "${staging_dir}"
[[ -x ${staging_dir}/bin/kriyan-node && -x ${staging_dir}/bin/kriyan ]] || {
  echo "standalone binaries missing" >&2
  exit 2
}
mv "${staging_dir}" "${release_dir}"
trap - EXIT
switch_current_release "${release_dir}"
printf 'KRIYAN_RELEASE_VERSION=%s\n' "${version}" >/etc/kriyan/release.env
chown root:kriyan /etc/kriyan/release.env
chmod 0640 /etc/kriyan/release.env
install -m 0644 "${release_dir}/packaging/systemd/kriyan-node.service" /etc/systemd/system/kriyan-node.service
systemctl daemon-reload
echo "installed ${version}; add /etc/kriyan/node.json before enabling the service"
