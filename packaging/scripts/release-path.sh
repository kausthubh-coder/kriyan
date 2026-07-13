#!/usr/bin/env bash

validate_release_version() {
  local version=${1:-}
  [[ ${version} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || {
    echo "release version must be a safe immutable identifier" >&2
    return 2
  }
  [[ ${version} != "." && ${version} != ".." ]] || {
    echo "release version is invalid" >&2
    return 2
  }
}

release_path() {
  local version=$1
  local install_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local parent
  validate_release_version "${version}" || return
  [[ ! -L "${install_root}/releases" ]] || {
    echo "release root must not be a symlink" >&2
    return 2
  }
  [[ -d "${install_root}/releases" ]] || {
    echo "release root does not exist" >&2
    return 2
  }
  parent=$(cd "${install_root}/releases" && pwd -P)
  printf '%s/%s\n' "${parent}" "${version}"
}

assert_direct_release_child() {
  local target=$1
  local install_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local parent
  [[ ! -L "${install_root}/releases" ]] || {
    echo "release root must not be a symlink" >&2
    return 2
  }
  [[ -d "${install_root}/releases" ]] || {
    echo "release root does not exist" >&2
    return 2
  }
  parent=$(cd "${install_root}/releases" && pwd -P)
  [[ $(dirname -- "${target}") == "${parent}" && "${target}" != "${parent}" ]] || {
    echo "release path escaped the release root" >&2
    return 2
  }
}

switch_current_release() {
  local target=$1
  local install_root=${KRIYAN_OPT_ROOT:-/opt/kriyan}
  local current="${install_root}/current"
  local temporary="${install_root}/.current.$$"
  assert_direct_release_child "${target}" || return
  if [[ -e ${current} && ! -L ${current} ]]; then
    echo "current release pointer must be a symlink" >&2
    return 2
  fi
  rm -f "${temporary}"
  ln -s "${target}" "${temporary}"
  mv -f "${temporary}" "${current}"
}
