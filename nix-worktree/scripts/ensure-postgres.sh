#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/../lib/common.sh"

ensure_runtime_context "${1:-}"
derive_worktree_identity
load_credentials
ensure_backend_port
ensure_postgres_cert

if ! command -v initdb >/dev/null 2>&1; then
  printf 'postgresql tools not found. run inside `nix develop .#worktree-db`.\n' >&2
  exit 1
fi

cluster_dir="$WORKTREE_DB_DIR/data"
runtime_dir="$WORKTREE_DB_DIR/run"
log_dir="$WORKTREE_DB_DIR/log"
init_password_file="$WORKTREE_DB_DIR/initdb-password.txt"
postgres_conf="$cluster_dir/postgresql.auto-worktree.conf"
hba_conf="$cluster_dir/pg_hba.conf"
server_log="$log_dir/postgres.log"
postgres_socket_dir="$runtime_dir"

ensure_dir "$runtime_dir"
ensure_dir "$log_dir"

exec 8>"$WORKTREE_LOCK_DIR/postgres.lock"
flock 8

if [[ ! -d "$cluster_dir/base" ]]; then
  printf '%s\n' "$DB_PASSWORD" >"$init_password_file"
  initdb \
    --pgdata="$cluster_dir" \
    --username=postgres \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --pwfile="$init_password_file" >/dev/null
  rm -f "$init_password_file"
fi

cat >"$postgres_conf" <<EOF
listen_addresses = '127.0.0.1'
port = $BACKEND_PORT
max_connections = 50
unix_socket_directories = '$postgres_socket_dir'
ssl = on
ssl_cert_file = '$PG_TLS_CERT_FILE'
ssl_key_file = '$PG_TLS_KEY_FILE'
password_encryption = 'scram-sha-256'
logging_collector = on
log_directory = '$log_dir'
log_filename = 'postgresql.log'
EOF

cat >"$hba_conf" <<EOF
local   all             all                                     trust
hostssl all             all             127.0.0.1/32            scram-sha-256
hostssl all             all             ::1/128                 scram-sha-256
EOF

if [[ -f "$cluster_dir/postgresql.conf" ]]; then
  if ! grep -q "postgresql.auto-worktree.conf" "$cluster_dir/postgresql.conf"; then
    printf "\ninclude '%s'\n" "$postgres_conf" >>"$cluster_dir/postgresql.conf"
  fi
fi

if pg_ctl -D "$cluster_dir" status >/dev/null 2>&1; then
  pg_ctl -D "$cluster_dir" reload >/dev/null
else
  pg_ctl -D "$cluster_dir" -l "$server_log" start >/dev/null
fi

for _ in $(seq 1 60); do
  if pg_isready -h 127.0.0.1 -p "$BACKEND_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

pg_isready -h 127.0.0.1 -p "$BACKEND_PORT" >/dev/null 2>&1

psql -h "$postgres_socket_dir" -U postgres -d postgres -v ON_ERROR_STOP=1 <<EOF >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '$DB_USER', '$DB_PASSWORD');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '$DB_USER', '$DB_PASSWORD');
  END IF;
END
\$\$;
EOF

if ! psql -h "$postgres_socket_dir" -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  psql -h "$postgres_socket_dir" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" >/dev/null
fi

flock -u 8
exec 8>&-

"$SCRIPT_DIR/render-route.sh" "$WORKTREE_ROOT" >/dev/null
write_connection_outputs

printf '%s\n' "$WORKTREE_LOCAL_DIR/db.env"
