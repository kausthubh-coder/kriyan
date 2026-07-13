#!/usr/bin/env bash
set -euo pipefail

destination=${1:?usage: backup.sh DESTINATION.tar.gz}
umask 077
tar -czf "${destination}" -C / var/lib/kriyan etc/kriyan/node.json
tar -tzf "${destination}" >/dev/null
echo "backup verified: ${destination}"
