#!/usr/bin/env bash
set -euo pipefail

output=${1:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
node_binary=${2:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
cli_binary=${3:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
sha=${4:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
provenance=${5:?usage: build-release.sh OUTPUT.tar.gz NODE_BINARY CLI_BINARY SHA PROVENANCE_MANIFEST}
output=$(cd "$(dirname "${output}")" && pwd -P)/$(basename "${output}")
node_binary=$(cd "$(dirname "${node_binary}")" && pwd -P)/$(basename "${node_binary}")
cli_binary=$(cd "$(dirname "${cli_binary}")" && pwd -P)/$(basename "${cli_binary}")
provenance=$(cd "$(dirname "${provenance}")" && pwd -P)/$(basename "${provenance}")
root=$(git rev-parse --show-toplevel)
commit=$(git rev-parse --verify "${sha}^{commit}")
tree=$(git rev-parse "${commit}^{tree}")
epoch=$(git show -s --format=%ct "${commit}")
temporary="${output}.partial.$$"
source_archive=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-source.XXXXXX")
uncompressed=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-ustar.XXXXXX")
entry_list=$(mktemp "${TMPDIR:-/tmp}/kriyan-release-entries.XXXXXX")
staging=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-release-stage.XXXXXX")
trap 'rm -f "${temporary}" "${source_archive}" "${uncompressed}" "${entry_list}"; rm -rf "${staging}"' EXIT

"${root}/packaging/scripts/verify-build-inputs.sh" \
  "${node_binary}" "${cli_binary}" "${commit}" "${provenance}"
git archive --format=tar --output="${source_archive}" "${commit}"
tar -xf "${source_archive}" -C "${staging}"
install -d -m 0755 "${staging}/bin" "${staging}/provenance"
install -m 0755 "${node_binary}" "${staging}/bin/kriyan-node"
install -m 0755 "${cli_binary}" "${staging}/bin/kriyan"
install -m 0644 "${provenance}" "${staging}/provenance/build.manifest"
printf 'source_commit=%s\nsource_tree=%s\n' \
  "${commit}" "${tree}" >"${staging}/provenance/source.manifest"

if find "${staging}" \( -type l -o ! \( -type d -o -type f \) \) -print -quit | grep -q .; then
  echo "release staging contains a link or special entry" >&2
  exit 2
fi
find "${staging}" -type d -exec chmod 0755 {} +
find "${staging}" -type f -exec chmod 0644 {} +
while IFS=$'\t' read -r -d '' metadata path; do
  mode=${metadata%% *}
  [[ ${mode} == 100755 ]] && chmod 0755 "${staging}/${path}"
done < <(git ls-tree -rz "${commit}")
chmod 0755 "${staging}/bin/kriyan-node" "${staging}/bin/kriyan"

stamp=$(TZ=UTC perl -MPOSIX=strftime -e 'print strftime("%Y%m%d%H%M.%S", gmtime($ARGV[0]))' "${epoch}")
TZ=UTC find "${staging}" -exec touch -h -t "${stamp}" {} +
(
  cd "${staging}"
  {
    find . -type f -print0
    while IFS= read -r -d '' directory; do
      printf '%s/\0' "${directory}"
    done < <(find . -type d ! -name . -print0)
  } | LC_ALL=C sort -z >"${entry_list}"
  COPYFILE_DISABLE=1 tar -cf "${uncompressed}" --format ustar \
    --uid 0 --gid 0 --uname root --gname root --no-recursion --null \
    --no-acls --no-fflags --no-mac-metadata --no-xattrs -T "${entry_list}"
)
gzip -n -9 <"${uncompressed}" >"${temporary}"

"${root}/packaging/scripts/verify-release-archive.sh" "${temporary}" \
  "${commit}" "${tree}" "${root}" "$(dirname "${node_binary}")" \
  "$(dirname "${cli_binary}")" "${HOME:-}" "${TMPDIR:-}" "${USER:-}" "${LOGNAME:-}"
mv "${temporary}" "${output}"
source "${root}/packaging/scripts/provenance-lib.sh"
printf '%s  %s\n' "$(sha256_file "${output}")" "$(basename "${output}")" >"${output}.sha256"
echo "release verified from exact commit ${commit}: ${output}"
