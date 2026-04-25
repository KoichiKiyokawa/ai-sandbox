#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/../lib/common.sh"

ensure_runtime_context "${1:-}"

if [[ "${WORKTREE_DB_NIX_BOOTSTRAPPED:-0}" != "1" ]]; then
  if ! command -v traefik >/dev/null 2>&1 || ! command -v initdb >/dev/null 2>&1; then
    if command -v nix >/dev/null 2>&1; then
      export WORKTREE_DB_NIX_BOOTSTRAPPED=1
      exec nix --extra-experimental-features "nix-command flakes" develop "$REPO_ROOT#worktree-db" --command bash "$0" "$WORKTREE_ROOT"
    fi
    printf 'required tools are missing. install Nix or run inside `nix develop .#worktree-db`.\n' >&2
    exit 1
  fi
fi

"$SCRIPT_DIR/ensure-traefik.sh" "$WORKTREE_ROOT" >/dev/null
"$SCRIPT_DIR/ensure-postgres.sh" "$WORKTREE_ROOT" >/dev/null

if [[ -n "${WORKTREE_DB_MIGRATION_CMD:-}" ]]; then
  (
    cd "$WORKTREE_ROOT"
    eval "$WORKTREE_DB_MIGRATION_CMD"
  )
fi

cat <<EOF
worktree_root=$WORKTREE_ROOT
db_env=$WORKTREE_LOCAL_DIR/db.env
db_connection=$WORKTREE_LOCAL_DIR/db-connection.txt
EOF
