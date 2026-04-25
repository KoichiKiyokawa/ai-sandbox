#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/../lib/common.sh"

ensure_runtime_context "${1:-}"

if ! command -v traefik >/dev/null 2>&1; then
  printf 'traefik command not found. run inside `nix develop .#worktree-db`.\n' >&2
  exit 1
fi

template_file="$REPO_ROOT/nix-worktree/traefik/static.toml.tmpl"
rendered_file="$COMMON_TRAEFIK_DIR/static.toml"
tmp_file="${rendered_file}.tmp"
pid_file="$COMMON_TRAEFIK_DIR/traefik.pid"
stdout_file="$COMMON_TRAEFIK_DIR/traefik.stdout.log"
log_file="$COMMON_TRAEFIK_DIR/traefik.log"
access_log_file="$COMMON_TRAEFIK_DIR/traefik-access.log"

exec 9>"$COMMON_LOCK_DIR/common.lock"
flock 9

sed \
  -e "s#__DYNAMIC_DIR__#$COMMON_DYNAMIC_DIR#g" \
  -e "s#__LOG_FILE__#$log_file#g" \
  -e "s#__ACCESS_LOG_FILE__#$access_log_file#g" \
  "$template_file" >"$tmp_file"
mv "$tmp_file" "$rendered_file"

if is_managed_pid_running "$pid_file"; then
  flock -u 9
  exec 9>&-
  wait_for_port 127.0.0.1 5432
  printf '%s\n' "$pid_file"
  exit 0
fi

if lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'port 5432 is already in use by another process; traefik cannot claim 127.0.0.1:5432\n' >&2
  exit 1
fi

nohup traefik --configFile "$rendered_file" >>"$stdout_file" 2>&1 &
printf '%s\n' "$!" >"$pid_file"

flock -u 9
exec 9>&-

wait_for_port 127.0.0.1 5432
printf '%s\n' "$pid_file"
