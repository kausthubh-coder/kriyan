#!/usr/bin/env bash
set -euo pipefail

binary=${1:?usage: wait-for-health.sh BINARY CONFIG EXPECTED_RELEASE PREVIOUS_INSTANCE RESTARTED_AT [STABILITY_SECONDS]}
config=${2:?usage: wait-for-health.sh BINARY CONFIG EXPECTED_RELEASE PREVIOUS_INSTANCE RESTARTED_AT [STABILITY_SECONDS]}
expected_release=${3:?usage: wait-for-health.sh BINARY CONFIG EXPECTED_RELEASE PREVIOUS_INSTANCE RESTARTED_AT [STABILITY_SECONDS]}
previous_instance=${4:-none}
restarted_at=${5:?usage: wait-for-health.sh BINARY CONFIG EXPECTED_RELEASE PREVIOUS_INSTANCE RESTARTED_AT [STABILITY_SECONDS]}
stability_seconds=${6:-10}
deadline=$((SECONDS + 45))
stability_ms=$((stability_seconds * 1000))

while (( SECONDS < deadline )); do
  if "${binary}" \
    --health-config "${config}" \
    --expected-release "${expected_release}" \
    --not-instance "${previous_instance}" \
    --heartbeat-after "${restarted_at}" \
    --stability-ms "${stability_ms}"; then
    exit 0
  fi
  sleep 1
done
echo "new release did not produce a stable, identity-matched heartbeat" >&2
exit 1
