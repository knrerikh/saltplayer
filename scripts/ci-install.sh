#!/usr/bin/env bash
# npm ci for CI: GitHub downloads during install (Electron, prebuilt native modules such as
# node-datachannel) fail now and then with 5xx errors; retry instead of failing the run (#115).
set -u
attempts=${CI_INSTALL_ATTEMPTS:-3}
for attempt in $(seq 1 "$attempts"); do
  if npm ci "$@"; then
    exit 0
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "npm ci failed (attempt $attempt of $attempts); retrying in 30 s"
    sleep 30
  fi
done
echo "npm ci failed $attempts times"
exit 1
