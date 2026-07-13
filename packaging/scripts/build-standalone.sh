#!/usr/bin/env bash
set -euo pipefail

node_output=${1:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT}
cli_output=${2:?usage: build-standalone.sh NODE_OUTPUT CLI_OUTPUT}
root=$(cd "$(dirname "$0")/../.." && pwd)
node_temporary="${node_output}.partial.$$"
cli_temporary="${cli_output}.partial.$$"
trap 'rm -f "${node_temporary}" "${cli_temporary}"' EXIT

cd "${root}"
bun build --compile --target=bun-linux-x64 apps/node/src/main.ts --outfile "${node_temporary}"
bun build --compile --target=bun-linux-x64 apps/cli/src/main.ts --outfile "${cli_temporary}"
chmod 0755 "${node_temporary}" "${cli_temporary}"
file "${node_temporary}" | grep -Eq 'ELF 64-bit.*x86-64'
file "${cli_temporary}" | grep -Eq 'ELF 64-bit.*x86-64'
mv "${node_temporary}" "${node_output}"
mv "${cli_temporary}" "${cli_output}"
trap - EXIT
echo "standalone linux x64 executables verified: ${node_output} ${cli_output}"
