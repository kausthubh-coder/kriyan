#!/usr/bin/env bash
set -euo pipefail

node_output=${1:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT [OPERATOR_OUTPUT] [SHA]}
cli_output=${2:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT [OPERATOR_OUTPUT] [SHA]}
third=${3:-}
operator_output=${third}
sha=${4:-HEAD}
if [[ $# -eq 3 ]] && git rev-parse --verify "${third}^{commit}" >/dev/null 2>&1; then
  operator_output=
  sha=${third}
fi
root=$(cd "$(dirname "$0")/../.." && pwd)
output_dir=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-build-output.XXXXXX")
trap 'rm -rf "${output_dir}"' EXIT
"${root}/packaging/scripts/build-isolated.sh" "${sha}" "${output_dir}"
mkdir -p "$(dirname "${node_output}")" "$(dirname "${cli_output}")"
install -m 0755 "${output_dir}/kriyan-node-linux-x64" "${node_output}"
install -m 0755 "${output_dir}/kriyan-linux-x64" "${cli_output}"
install -m 0644 "${output_dir}/provenance.manifest" \
  "$(dirname "${node_output}")/provenance.manifest"
if [[ -n ${operator_output} ]]; then
  mkdir -p "$(dirname "${operator_output}")"
  install -m 0755 "${output_dir}/kriyan-darwin-arm64" "${operator_output}"
  install -m 0644 "${output_dir}/operator-provenance.manifest" \
    "$(dirname "${operator_output}")/operator-provenance.manifest"
fi
echo "standalone executables verified: ${node_output} ${cli_output} ${operator_output}"
