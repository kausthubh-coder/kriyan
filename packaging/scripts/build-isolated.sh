#!/usr/bin/env bash
set -euo pipefail

sha=${1:?usage: build-isolated.sh SHA OUTPUT_DIRECTORY}
output=${2:?usage: build-isolated.sh SHA OUTPUT_DIRECTORY}
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
tree=$(git rev-parse "${commit}^{tree}")
epoch=$(git show -s --format=%ct "${commit}")
temporary_root=${TMPDIR:-/tmp}
temporary_root=${temporary_root%/}
source_archive=$(mktemp "${temporary_root}/kriyan-source-archive.XXXXXX")
source_dir=$(mktemp -d "${temporary_root}/kriyan-isolated-source.XXXXXX")
build_dir=$(mktemp -d "${temporary_root}/kriyan-isolated-build.XXXXXX")
trap 'rm -f "${source_archive}"; rm -rf "${source_dir}" "${build_dir}"' EXIT
mkdir -p "${output}"
output=$(cd "${output}" && pwd -P)

git archive --format=tar --output="${source_archive}" "${commit}"
tar -xf "${source_archive}" -C "${source_dir}"
source "${root}/packaging/scripts/provenance-lib.sh"
lock_hash=$(sha256_file "${source_dir}/bun.lock")
[[ -f ${source_dir}/.bun-version && ! -L ${source_dir}/.bun-version ]] || {
  echo "exact commit is missing .bun-version toolchain policy" >&2
  exit 2
}
trusted_bun=$(tr -d '\r\n' <"${source_dir}/.bun-version")
[[ ${trusted_bun} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $(bun --version) == "${trusted_bun}" ]] || {
  echo "active Bun does not match the exact commit toolchain policy" >&2
  exit 2
}
(
  cd "${source_dir}"
  bun install --frozen-lockfile >/dev/null
  bun build --target=bun --minify --sourcemap=none \
    --outfile "${build_dir}/node.bundle.js" ./apps/node/src/main.ts >/dev/null
  bun build --target=bun --minify --sourcemap=none \
    --define "KRIYAN_TRUSTED_SOURCE_COMMIT=\"${commit}\"" \
    --define "KRIYAN_TRUSTED_SOURCE_TREE=\"${tree}\"" \
    --define "KRIYAN_TRUSTED_SOURCE_EPOCH=\"${epoch}\"" \
    --define "KRIYAN_TRUSTED_LOCK_SHA256=\"${lock_hash}\"" \
    --define "KRIYAN_TRUSTED_BUN_VERSION=\"${trusted_bun}\"" \
    --outfile "${build_dir}/cli.bundle.js" ./apps/cli/src/main.ts >/dev/null
)

physical_directory() {
  (cd "$1" && pwd -P)
}

add_path_aliases() {
  local path=$1
  forbidden_literals+=("${path}")
  case ${path} in
    /private/var/*) forbidden_literals+=("/var/${path#/private/var/}") ;;
    /var/*) forbidden_literals+=("/private/var/${path#/var/}") ;;
    /private/tmp/*) forbidden_literals+=("/tmp/${path#/private/tmp/}") ;;
    /tmp/*) forbidden_literals+=("/private/tmp/${path#/tmp/}") ;;
  esac
}

normalize_root() {
  local bundle=$1
  local logical=$2
  local replacement=$3
  local physical
  local aliases=()
  local path

  [[ -n ${logical} && ${logical} != / ]] || return 0
  physical=$(physical_directory "${logical}")
  aliases=("${logical}" "${physical}")
  for path in "${logical}" "${physical}"; do
    case ${path} in
      /private/var/*) aliases+=("/var/${path#/private/var/}") ;;
      /var/*) aliases+=("/private/var/${path#/var/}") ;;
      /private/tmp/*) aliases+=("/tmp/${path#/private/tmp/}") ;;
      /tmp/*) aliases+=("/private/tmp/${path#/tmp/}") ;;
    esac
  done
  for path in "${aliases[@]}"; do
    [[ -n ${path} && ${path} != / ]] || continue
    FROM="${path}" TO="${replacement}" perl -0pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "${bundle}"
  done
}

normalize_and_compile() {
  local bundle=$1
  local entry=$2
  local target=$3
  local normalized="${build_dir}/${entry}"

  cp "${bundle}" "${normalized}"
  normalize_root "${normalized}" "${source_dir}" /opt/kriyan/build/source
  normalize_root "${normalized}" "${build_dir}" /opt/kriyan/build/work
  normalize_root "${normalized}" "${output}" /opt/kriyan/build/output
  normalize_root "${normalized}" "${root}" /opt/kriyan/build/repo
  normalize_root "${normalized}" "${temporary_root}" /opt/kriyan/build/tmp
  normalize_root "${normalized}" "${HOME:-}" /opt/kriyan/build/home
  (
    cd "${build_dir}"
    bun build --compile --target=bun-linux-x64-baseline --no-compile-autoload-dotenv \
      --no-compile-autoload-bunfig --no-compile-autoload-tsconfig \
      --no-compile-autoload-package-json "./${entry}" --outfile "${target}" >/dev/null
  )
  chmod 0755 "${target}"
  # shellcheck source=packaging/scripts/provenance-lib.sh
  source "${root}/packaging/scripts/provenance-lib.sh"
  require_linux_x64_elf "${target}"
  "${root}/packaging/scripts/scan-binary-content.sh" "${target}" "${forbidden_literals[@]}"
}

normalize_and_compile_operator() {
  local bundle=$1
  local entry=$2
  local target=$3
  local normalized="${build_dir}/${entry}"

  cp "${bundle}" "${normalized}"
  normalize_root "${normalized}" "${source_dir}" /opt/kriyan/build/source
  normalize_root "${normalized}" "${build_dir}" /opt/kriyan/build/work
  normalize_root "${normalized}" "${output}" /opt/kriyan/build/output
  normalize_root "${normalized}" "${root}" /opt/kriyan/build/repo
  normalize_root "${normalized}" "${temporary_root}" /opt/kriyan/build/tmp
  normalize_root "${normalized}" "${HOME:-}" /opt/kriyan/build/home
  (
    cd "${build_dir}"
    bun build --compile --target=bun-darwin-arm64 --no-compile-autoload-dotenv \
      --no-compile-autoload-bunfig --no-compile-autoload-tsconfig \
      --no-compile-autoload-package-json "./${entry}" --outfile "${target}" >/dev/null
  )
  chmod 0755 "${target}"
  # shellcheck source=packaging/scripts/provenance-lib.sh
  source "${root}/packaging/scripts/provenance-lib.sh"
  require_darwin_arm64_macho "${target}"
  "${root}/packaging/scripts/scan-binary-content.sh" "${target}" "${forbidden_literals[@]}"
}

forbidden_literals=()
for directory in "${root}" "${source_dir}" "${build_dir}" "${output}" "${temporary_root}" "${HOME:-}"; do
  [[ -d ${directory} ]] || continue
  add_path_aliases "${directory}"
  add_path_aliases "$(physical_directory "${directory}")"
done
for name in "${USER:-}" "${LOGNAME:-}"; do
  [[ -n ${name} ]] && forbidden_literals+=("${name}")
done

normalize_and_compile "${build_dir}/node.bundle.js" node.bundle.normalized.js "${output}/kriyan-node-linux-x64"
normalize_and_compile "${build_dir}/cli.bundle.js" cli.bundle.normalized.js "${output}/kriyan-linux-x64"
normalize_and_compile_operator "${build_dir}/cli.bundle.js" operator.bundle.normalized.js "${output}/kriyan-darwin-arm64"

source "${root}/packaging/scripts/provenance-lib.sh"
node_hash=$(sha256_file "${output}/kriyan-node-linux-x64")
cli_hash=$(sha256_file "${output}/kriyan-linux-x64")
operator_hash=$(sha256_file "${output}/kriyan-darwin-arm64")
cat >"${output}/provenance.manifest" <<EOF
manifest_version=1
source_commit=${commit}
source_tree=${tree}
source_date_epoch=${epoch}
bun_version=${trusted_bun}
target=bun-linux-x64-baseline
lock_sha256=${lock_hash}
node_sha256=${node_hash}
cli_sha256=${cli_hash}
source_method=git-archive-file
bundle_entry=node.bundle.normalized.js,cli.bundle.normalized.js
normalized_build_prefix=/opt/kriyan/build
EOF
cat >"${output}/operator-provenance.manifest" <<EOF
manifest_version=1
source_commit=${commit}
source_tree=${tree}
source_date_epoch=${epoch}
bun_version=${trusted_bun}
target=bun-darwin-arm64
lock_sha256=${lock_hash}
cli_sha256=${operator_hash}
source_method=git-archive-file
bundle_entry=operator.bundle.normalized.js
normalized_build_prefix=/opt/kriyan/build
EOF
"${root}/packaging/scripts/verify-build-inputs.sh" \
  "${output}/kriyan-node-linux-x64" "${output}/kriyan-linux-x64" \
  "${commit}" "${output}/provenance.manifest"
"${root}/packaging/scripts/verify-operator-build.sh" \
  "${output}/kriyan-darwin-arm64" "${commit}" "${output}/operator-provenance.manifest"
echo "isolated exact-SHA build verified: ${commit}"
