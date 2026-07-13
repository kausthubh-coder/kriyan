#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: install.sh RELEASE_ARCHIVE}
version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
release_dir="/opt/kriyan/releases/${version}"
staging_dir="${release_dir}.partial.$$"
bun_bin=${BUN_BIN:-/usr/local/bin/bun}

if [[ ${EUID} -ne 0 ]]; then
  echo "install must run as root" >&2
  exit 2
fi

id kriyan >/dev/null 2>&1 || useradd --system --home /var/lib/kriyan --shell /usr/sbin/nologin kriyan
install -d -o kriyan -g kriyan -m 0700 /var/lib/kriyan
install -d -o root -g kriyan -m 0750 /etc/kriyan
install -d -o root -g root -m 0755 /opt/kriyan/releases
[[ -x ${bun_bin} ]] || { echo "Bun not found at ${bun_bin}" >&2; exit 2; }
rm -rf "${staging_dir}"
trap 'rm -rf "${staging_dir}"' EXIT
install -d -o root -g root -m 0755 "${staging_dir}"
tar -tzf "${archive}" >/dev/null
tar -xzf "${archive}" -C "${staging_dir}"
(cd "${staging_dir}" && "${bun_bin}" install --frozen-lockfile --production)
rm -rf "${release_dir}"
mv "${staging_dir}" "${release_dir}"
trap - EXIT
ln -sfn "${release_dir}" /opt/kriyan/current
install -m 0644 "${release_dir}/packaging/systemd/kriyan-node.service" /etc/systemd/system/kriyan-node.service
systemctl daemon-reload
echo "installed ${version}; add /etc/kriyan/node.json before enabling the service"
