#!/usr/bin/env bash
set -euo pipefail

first=${1:?usage: compare-builds.sh FIRST_DIRECTORY SECOND_DIRECTORY OUTPUT}
second=${2:?usage: compare-builds.sh FIRST_DIRECTORY SECOND_DIRECTORY OUTPUT}
output=${3:?usage: compare-builds.sh FIRST_DIRECTORY SECOND_DIRECTORY OUTPUT}
first_node=$(shasum -a 256 "${first}/kriyan-node-linux-x64" | awk '{print $1}')
second_node=$(shasum -a 256 "${second}/kriyan-node-linux-x64" | awk '{print $1}')
first_cli=$(shasum -a 256 "${first}/kriyan-linux-x64" | awk '{print $1}')
second_cli=$(shasum -a 256 "${second}/kriyan-linux-x64" | awk '{print $1}')
verdict=not-reproducible
if [[ ${first_node} == "${second_node}" && ${first_cli} == "${second_cli}" ]]; then
  verdict=reproducible
fi
cat >"${output}" <<EOF
verdict=${verdict}
first_node_sha256=${first_node}
second_node_sha256=${second_node}
first_cli_sha256=${first_cli}
second_cli_sha256=${second_cli}
EOF
cat "${output}"
