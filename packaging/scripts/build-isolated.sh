#!/usr/bin/env bash
set -euo pipefail

sha=${1:?usage: build-isolated.sh SHA OUTPUT_DIRECTORY}
output=${2:?usage: build-isolated.sh SHA OUTPUT_DIRECTORY}
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
tree=$(git rev-parse "${commit}^{tree}")
source_dir=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-isolated-source.XXXXXX")
trap 'rm -rf "${source_dir}"' EXIT
mkdir -p "${output}"

git archive "${commit}" | tar -x -C "${source_dir}"
(
  cd "${source_dir}"
  bun install --frozen-lockfile >/dev/null
  bun build --target=bun --minify --sourcemap=none \
    --outfile "${source_dir}/node.bundle.js" ./apps/node/src/main.ts >/dev/null
  bun build --target=bun --minify --sourcemap=none \
    --outfile "${source_dir}/cli.bundle.js" ./apps/cli/src/main.ts >/dev/null
)

normalize_and_compile() {
  local bundle=$1
  local target=$2
  local normalized="${bundle}.normalized"
  SOURCE_ROOT="${source_dir}" perl -pe 's/\Q$ENV{SOURCE_ROOT}\E/\/opt\/kriyan\/build/g' \
    "${bundle}" >"${normalized}"
  bun build --compile --target=bun-linux-x64 --no-compile-autoload-dotenv \
    --no-compile-autoload-bunfig --no-compile-autoload-tsconfig \
    --no-compile-autoload-package-json /dev/stdin --outfile "${target}" \
    <"${normalized}" >/dev/null
  chmod 0755 "${target}"
  file "${target}" | grep -Eq 'ELF 64-bit.*x86-64'
  "${root}/packaging/scripts/scan-binary-content.sh" "${target}" \
    "${root}" "${source_dir}" "${USER:-}" "${HOME:-}"
}

normalize_and_compile "${source_dir}/node.bundle.js" "${output}/kriyan-node-linux-x64"
normalize_and_compile "${source_dir}/cli.bundle.js" "${output}/kriyan-linux-x64"

node_hash=$(shasum -a 256 "${output}/kriyan-node-linux-x64" | awk '{print $1}')
cli_hash=$(shasum -a 256 "${output}/kriyan-linux-x64" | awk '{print $1}')
lock_hash=$(git show "${commit}:bun.lock" | shasum -a 256 | awk '{print $1}')
cat >"${output}/provenance.manifest" <<EOF
source_commit=${commit}
source_tree=${tree}
bun_version=$(bun --version)
target=bun-linux-x64
lock_sha256=${lock_hash}
node_sha256=${node_hash}
cli_sha256=${cli_hash}
source_method=git-archive
bundle_entry=/dev/stdin
normalized_build_prefix=/opt/kriyan/build
EOF
echo "isolated exact-SHA build verified: ${commit}"
