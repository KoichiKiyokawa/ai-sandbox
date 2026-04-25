#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/../lib/common.sh"

ensure_runtime_context "${1:-}"
derive_worktree_identity
ensure_backend_port

route_file="$COMMON_DYNAMIC_DIR/${WORKTREE_SLUG}.toml"
tmp_file="${route_file}.tmp"

exec 9>"$COMMON_LOCK_DIR/common.lock"
flock 9

cat >"$tmp_file" <<EOF
[tcp.routers.${WORKTREE_SLUG}]
  entryPoints = ["postgres"]
  rule = "HostSNI(\`$DB_HOST\`)"
  service = "${WORKTREE_SLUG}"
  [tcp.routers.${WORKTREE_SLUG}.tls]
    passthrough = true

[tcp.services.${WORKTREE_SLUG}.loadBalancer]
  [[tcp.services.${WORKTREE_SLUG}.loadBalancer.servers]]
    address = "127.0.0.1:$BACKEND_PORT"
EOF

mv "$tmp_file" "$route_file"

flock -u 9
exec 9>&-

printf '%s\n' "$route_file"
