#!/usr/bin/env bash
set -euo pipefail

install_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=packaging/scripts/lifecycle-lib.sh
source "${install_script_dir}/lifecycle-lib.sh"

install_main() {
  local effective_uid=${1:?effective uid is required}
  shift
  local archive=${1:?usage: install.sh RELEASE_ARCHIVE}
  local version=${KRIYAN_VERSION:?KRIYAN_VERSION is required}
  local opt_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local etc_root=${KRIYAN_ETC_ROOT:-/etc/kriyan}
  local state_root=${KRIYAN_STATE_ROOT:-/var/lib/kriyan}
  local release_dir
  local incoming_manifest
  local staging_dir

  if [[ ${effective_uid} -ne 0 ]]; then
    echo "install must run as root" >&2
    return 2
  fi

  id kriyan >/dev/null 2>&1 || useradd --system --home "${state_root}" --shell /usr/sbin/nologin kriyan
  install -d -o kriyan -g kriyan -m 0700 "${state_root}"
  install -d -o root -g kriyan -m 0750 "${etc_root}"
  install -d -o root -g root -m 0755 "${opt_root}/releases"
  release_dir=$(release_path "${version}")
  assert_direct_release_child "${release_dir}"
  "${install_script_dir}/verify-release-archive.sh" "${archive}" "${version}"
  if [[ -e ${release_dir} || -L ${release_dir} ]]; then
    [[ -d ${release_dir} && ! -L ${release_dir} ]] || {
      echo "existing release is not an immutable directory" >&2
      return 2
    }
    incoming_manifest=$(mktemp "${TMPDIR:-/tmp}/kriyan-incoming-manifest.XXXXXX")
    trap 'rm -f "${incoming_manifest}"' EXIT
    tar -xOzf "${archive}" ./provenance/build.manifest >"${incoming_manifest}"
    cmp -s "${incoming_manifest}" "${release_dir}/provenance/build.manifest" || {
      echo "release identifier already exists with different provenance" >&2
      return 2
    }
    validate_installed_release "${release_dir}" "${version}"
    rm -f "${incoming_manifest}"
    trap - EXIT
    activate_release_state "${release_dir}" "${version}"
    echo "release ${version} already verified; current pointer refreshed"
    return 0
  fi
  staging_dir="${release_dir}.partial.$$"
  assert_direct_release_child "${staging_dir}"
  rm -rf "${staging_dir}"
  trap 'rm -rf "${staging_dir}"' EXIT
  install -d -o root -g root -m 0755 "${staging_dir}"
  tar -xzf "${archive}" -C "${staging_dir}"
  [[ -x ${staging_dir}/bin/kriyan-node && -x ${staging_dir}/bin/kriyan ]] || {
    echo "standalone binaries missing" >&2
    return 2
  }
  mv "${staging_dir}" "${release_dir}"
  trap - EXIT
  activate_release_state "${release_dir}" "${version}"
  echo "installed ${version}; add ${etc_root}/node.json before enabling the service"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  install_main "${EUID}" "$@"
fi
