#!/usr/bin/env bash

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

require_linux_x64_elf() {
  local binary=$1
  local description
  local magic

  [[ -f ${binary} && ! -L ${binary} && -x ${binary} ]] || {
    echo "release input is not a regular executable: ${binary}" >&2
    return 2
  }
  magic=$(od -An -tx1 -N4 "${binary}" | tr -d ' \n')
  [[ ${magic} == 7f454c46 ]] || {
    echo "release input is not an ELF executable: ${binary}" >&2
    return 2
  }
  description=$(file -b "${binary}")
  [[ ${description} =~ ELF\ 64-bit.*x86-64 ]] || {
    echo "release input is not a Linux x64 ELF executable: ${binary}" >&2
    return 2
  }
}

require_darwin_arm64_macho() {
  local binary=$1
  local description
  [[ -f ${binary} && -x ${binary} && ! -L ${binary} ]] || {
    echo "operator CLI is missing, non-executable, or a symlink" >&2
    return 2
  }
  description=$(file -b "${binary}")
  [[ ${description} == *Mach-O* && ${description} == *arm64* ]] || {
    echo "operator CLI is not a macOS arm64 Mach-O executable" >&2
    return 2
  }
}

manifest_value() {
  local manifest=$1
  local key=$2
  awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, ""); print }' "${manifest}"
}

validate_manifest_schema() {
  local manifest=$1
  [[ -f ${manifest} && ! -L ${manifest} ]] || {
    echo "provenance manifest is missing or is not a regular file" >&2
    return 2
  }
  awk -F= '
    BEGIN {
      split("manifest_version source_commit source_tree source_date_epoch bun_version target lock_sha256 node_sha256 cli_sha256 source_method bundle_entry normalized_build_prefix", keys, " ")
      for (i in keys) allowed[keys[i]] = 1
    }
    NF != 2 || !allowed[$1] || $2 == "" || seen[$1]++ { bad = 1 }
    END {
      for (key in allowed) if (seen[key] != 1) bad = 1
      exit bad ? 1 : 0
    }
  ' "${manifest}" || {
    echo "provenance manifest schema is invalid, incomplete, or duplicated" >&2
    return 2
  }
}

validate_provenance_manifest() {
  local manifest=$1
  local node_binary=$2
  local cli_binary=$3
  local expected_commit=${4:-}
  local expected_tree=${5:-}
  local expected_lock=${6:-}
  local expected_epoch=${7:-}
  local expected_bun=${8:-}
  local node_hash
  local cli_hash

  validate_manifest_schema "${manifest}"
  require_linux_x64_elf "${node_binary}"
  require_linux_x64_elf "${cli_binary}"

  [[ $(manifest_value "${manifest}" manifest_version) == 1 ]]
  [[ $(manifest_value "${manifest}" source_commit) =~ ^[0-9a-f]{40}$ ]]
  [[ $(manifest_value "${manifest}" source_tree) =~ ^[0-9a-f]{40}$ ]]
  [[ $(manifest_value "${manifest}" source_date_epoch) =~ ^[0-9]+$ ]]
  [[ $(manifest_value "${manifest}" lock_sha256) =~ ^[0-9a-f]{64}$ ]]
  [[ $(manifest_value "${manifest}" node_sha256) =~ ^[0-9a-f]{64}$ ]]
  [[ $(manifest_value "${manifest}" cli_sha256) =~ ^[0-9a-f]{64}$ ]]
  [[ $(manifest_value "${manifest}" target) == bun-linux-x64-baseline ]]
  [[ $(manifest_value "${manifest}" source_method) == git-archive-file ]]
  [[ $(manifest_value "${manifest}" bundle_entry) == node.bundle.normalized.js,cli.bundle.normalized.js ]]
  [[ $(manifest_value "${manifest}" normalized_build_prefix) == /opt/kriyan/build ]]

  node_hash=$(sha256_file "${node_binary}")
  cli_hash=$(sha256_file "${cli_binary}")
  [[ ${node_hash} == "$(manifest_value "${manifest}" node_sha256)" ]] || {
    echo "node ELF hash does not match provenance manifest" >&2
    return 2
  }
  [[ ${cli_hash} == "$(manifest_value "${manifest}" cli_sha256)" ]] || {
    echo "CLI ELF hash does not match provenance manifest" >&2
    return 2
  }
  [[ -z ${expected_commit} || $(manifest_value "${manifest}" source_commit) == "${expected_commit}" ]] || {
    echo "provenance commit does not match requested exact SHA" >&2
    return 2
  }
  [[ -z ${expected_tree} || $(manifest_value "${manifest}" source_tree) == "${expected_tree}" ]] || {
    echo "provenance tree does not match requested exact tree" >&2
    return 2
  }
  [[ -z ${expected_lock} || $(manifest_value "${manifest}" lock_sha256) == "${expected_lock}" ]] || {
    echo "provenance lock hash does not match requested exact commit" >&2
    return 2
  }
  [[ -z ${expected_epoch} || $(manifest_value "${manifest}" source_date_epoch) == "${expected_epoch}" ]] || {
    echo "provenance epoch does not match requested exact commit" >&2
    return 2
  }
  [[ -z ${expected_bun} || $(manifest_value "${manifest}" bun_version) == "${expected_bun}" ]] || {
    echo "provenance Bun version does not match the builder" >&2
    return 2
  }
}
