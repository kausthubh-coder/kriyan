#!/usr/bin/env bash
set -euo pipefail

node_output=${1:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT [SHA]}
cli_output=${2:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT [SHA]}
sha=${3:-HEAD}
root=$(cd "$(dirname "$0")/../.." && pwd)
output_dir=$(mktemp -d "${TMPDIR:-/tmp}/kriyan-build-output.XXXXXX")
trap 'rm -rf "${output_dir}"' EXIT
"${root}/packaging/scripts/build-isolated.sh" "${sha}" "${output_dir}"
install -m 0755 "${output_dir}/kriyan-node-linux-x64" "${node_output}"
install -m 0755 "${output_dir}/kriyan-linux-x64" "${cli_output}"
echo "standalone linux x64 executables verified: ${node_output} ${cli_output}"
