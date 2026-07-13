#!/usr/bin/env bash
set -euo pipefail

output=${1:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
node_binary=${2:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
cli_binary=${3:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
sha=${4:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
provenance=${5:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
temporary="${output}.partial.$$"
staging=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-release-stage.XXXXXX")
trap 'rm -f "${temporary}"; rm -rf "${staging}"' EXIT

[[ -x ${node_binary} && -x ${cli_binary} && -f ${provenance} ]] || {
  echo "standalone binaries or provenance manifest are missing" >&2
  exit 2
}
git archive "${commit}" | tar -x -C "${staging}"
install -d -m 0755 "${staging}/bin" "${staging}/provenance"
install -m 0755 "${node_binary}" "${staging}/bin/kriyan-node"
install -m 0755 "${cli_binary}" "${staging}/bin/kriyan"
install -m 0644 "${provenance}" "${staging}/provenance/build.manifest"
printf 'source_commit=%s\nsource_tree=%s\n' \
  "${commit}" "$(git rev-parse "${commit}^{tree}")" >"${staging}/provenance/source.manifest"

COPYFILE_DISABLE=1 tar -czf "${temporary}" -C "${staging}" .
"${root}/packaging/scripts/verify-release-archive.sh" "${temporary}"
mv "${temporary}" "${output}"
shasum -a 256 "${output}" >"${output}.sha256"
echo "release verified from exact commit ${commit}: ${output}"
