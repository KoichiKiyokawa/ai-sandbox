#!/usr/bin/env bash
# One-time setup: provision the apple container DNS domain.
# For AC_DOMAIN=local this needs sudo (creates /etc/resolver/local).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "Provisioning apple container DNS domain '$AC_DOMAIN' (needs sudo)..."
sudo container system dns create "$AC_DOMAIN"

echo
echo "Provisioned domains:"
container system dns list

if [ "$AC_DOMAIN" = "local" ]; then
  cat <<'NOTE'

NOTE on .local:
  macOS reserves .local for mDNS/Bonjour. apple container installs a
  /etc/resolver/local entry that routes *.local to its container DNS, which
  generally takes precedence for container hostnames. If you ever see flaky
  resolution or mDNS conflicts, switch to the pre-provisioned .test domain:

      AC_DOMAIN=test ./scripts/up.sh

  (The whole project is domain-agnostic via AC_DOMAIN.)
NOTE
fi
