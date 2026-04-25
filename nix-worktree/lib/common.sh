#!/usr/bin/env bash
set -euo pipefail

repo_root_from_script() {
  local script_dir
  script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
  cd -- "$script_dir/../.." && pwd -P
}

resolve_abs_path() {
  local base="$1"
  local target="$2"

  if [[ "$target" = /* ]]; then
    cd -- "$target" && pwd -P
  else
    cd -- "$base/$target" && pwd -P
  fi
}

ensure_dir() {
  mkdir -p "$1"
}

normalize_host_label() {
  local raw="$1"
  local lowered normalized

  lowered=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')
  normalized=$(printf '%s' "$lowered" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')

  if [[ -z "$normalized" ]]; then
    normalized="worktree"
  fi

  if [[ ${#normalized} -gt 40 ]]; then
    normalized="${normalized:0:40}"
    normalized="${normalized%-}"
  fi

  printf '%s\n' "$normalized"
}

short_hash() {
  printf '%s' "$1" | sha256sum | awk '{print substr($1, 1, 8)}'
}

reserve_worktree_slug() {
  local common_state_dir="$1"
  local requested_slug="$2"
  local worktree_root="$3"
  local registry_dir record current hash candidate

  registry_dir="$common_state_dir/worktree-slugs"
  ensure_dir "$registry_dir"

  record="$registry_dir/$requested_slug.path"
  if [[ -f "$record" ]]; then
    current=$(cat "$record")
    if [[ "$current" = "$worktree_root" ]]; then
      printf '%s\n' "$requested_slug"
      return
    fi
  else
    printf '%s\n' "$worktree_root" >"$record"
    printf '%s\n' "$requested_slug"
    return
  fi

  hash=$(short_hash "$worktree_root")
  candidate="${requested_slug}-${hash}"
  if [[ ${#candidate} -gt 48 ]]; then
    candidate="${candidate:0:48}"
    candidate="${candidate%-}"
    candidate="${candidate}-${hash}"
  fi

  record="$registry_dir/$candidate.path"
  if [[ -f "$record" ]]; then
    current=$(cat "$record")
    if [[ "$current" != "$worktree_root" ]]; then
      printf 'worktree slug collision for %s and %s\n' "$candidate" "$worktree_root" >&2
      return 1
    fi
  else
    printf '%s\n' "$worktree_root" >"$record"
  fi

  printf '%s\n' "$candidate"
}

is_managed_pid_running() {
  local pid_file="$1"

  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid=$(cat "$pid_file")
  if [[ -z "$pid" ]]; then
    return 1
  fi

  kill -0 "$pid" 2>/dev/null
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local retries="${3:-50}"
  local attempt

  for ((attempt = 1; attempt <= retries; attempt += 1)); do
    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done

  printf 'timeout waiting for %s:%s\n' "$host" "$port" >&2
  return 1
}

ensure_runtime_context() {
  local worktree_arg="${1:-}"
  local caller_dir repo_root git_common_dir git_dir worktree_root

  if [[ -n "$worktree_arg" ]]; then
    worktree_root=$(resolve_abs_path "$PWD" "$worktree_arg")
  else
    worktree_root=$(git rev-parse --show-toplevel)
    worktree_root=$(cd -- "$worktree_root" && pwd -P)
  fi

  caller_dir=$(pwd -P)
  repo_root=$(repo_root_from_script)

  git_common_dir=$(git -C "$worktree_root" rev-parse --git-common-dir)
  git_dir=$(git -C "$worktree_root" rev-parse --git-dir)

  if [[ "$git_common_dir" != /* ]]; then
    git_common_dir=$(resolve_abs_path "$worktree_root" "$git_common_dir")
  fi

  if [[ "$git_dir" != /* ]]; then
    git_dir=$(resolve_abs_path "$worktree_root" "$git_dir")
  fi

  export CALLER_DIR="$caller_dir"
  export REPO_ROOT="$repo_root"
  export WORKTREE_ROOT="$worktree_root"
  export GIT_COMMON_DIR="$git_common_dir"
  export GIT_DIR="$git_dir"
  export COMMON_STATE_DIR="$git_common_dir/nix-worktree"
  export COMMON_LOCK_DIR="$COMMON_STATE_DIR/locks"
  export COMMON_DYNAMIC_DIR="$COMMON_STATE_DIR/traefik/dynamic"
  export COMMON_TRAEFIK_DIR="$COMMON_STATE_DIR/traefik"
  export WORKTREE_LOCAL_DIR="$WORKTREE_ROOT/.local"
  export WORKTREE_LOCK_DIR="$WORKTREE_LOCAL_DIR/locks"
  export WORKTREE_DB_DIR="$WORKTREE_LOCAL_DIR/postgres"
  export WORKTREE_META_DIR="$WORKTREE_LOCAL_DIR/db"

  ensure_dir "$COMMON_STATE_DIR"
  ensure_dir "$COMMON_LOCK_DIR"
  ensure_dir "$COMMON_DYNAMIC_DIR"
  ensure_dir "$COMMON_TRAEFIK_DIR"
  ensure_dir "$WORKTREE_LOCAL_DIR"
  ensure_dir "$WORKTREE_LOCK_DIR"
  ensure_dir "$WORKTREE_DB_DIR"
  ensure_dir "$WORKTREE_META_DIR"
}

derive_worktree_identity() {
  local raw_name requested_slug reserved_slug host

  raw_name=$(basename "$WORKTREE_ROOT")
  requested_slug=$(normalize_host_label "$raw_name")

  exec 9>"$COMMON_LOCK_DIR/common.lock"
  flock 9
  reserved_slug=$(reserve_worktree_slug "$COMMON_STATE_DIR" "$requested_slug" "$WORKTREE_ROOT")
  flock -u 9
  exec 9>&-

  host="${reserved_slug}-db.localhost"

  export WORKTREE_SLUG="$reserved_slug"
  export DB_HOST="$host"
}

pick_backend_port() {
  local port_file="$WORKTREE_META_DIR/backend.port"
  local registry_file="$COMMON_STATE_DIR/worktree-ports/${WORKTREE_SLUG}.port"
  local min_port=55432
  local max_port=60431
  local hash_value candidate in_use registry_entry existing_port

  if [[ -f "$port_file" ]]; then
    if [[ ! -f "$registry_file" ]]; then
      ensure_dir "$(dirname "$registry_file")"
      cp "$port_file" "$registry_file"
    fi
    cat "$port_file"
    return
  fi

  if [[ -f "$registry_file" ]]; then
    cp "$registry_file" "$port_file"
    cat "$port_file"
    return
  fi

  hash_value=$(printf '%s' "$(short_hash "$WORKTREE_ROOT")" | awk '{print strtonum("0x" $1)}')
  candidate=$((min_port + (hash_value % (max_port - min_port))))
  ensure_dir "$(dirname "$registry_file")"

  while :; do
    in_use=0
    while IFS= read -r registry_entry; do
      if [[ -f "$registry_entry" ]]; then
        existing_port=$(cat "$registry_entry")
        if [[ "$existing_port" = "$candidate" ]]; then
          in_use=1
          break
        fi
      fi
    done < <(find "$COMMON_STATE_DIR/worktree-ports" -name '*.port' -type f 2>/dev/null)

    if [[ "$in_use" -eq 0 ]] && ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
      printf '%s\n' "$candidate" >"$port_file"
      printf '%s\n' "$candidate" >"$registry_file"
      printf '%s\n' "$candidate"
      return
    fi

    candidate=$((candidate + 1))
    if [[ "$candidate" -gt "$max_port" ]]; then
      candidate="$min_port"
    fi
  done
}

ensure_backend_port() {
  exec 9>"$COMMON_LOCK_DIR/common.lock"
  flock 9
  export BACKEND_PORT
  BACKEND_PORT=$(pick_backend_port)
  flock -u 9
  exec 9>&-
}

load_credentials() {
  local credentials_file="$WORKTREE_META_DIR/credentials.env"

  if [[ ! -f "$credentials_file" ]]; then
    {
      printf 'DB_NAME=app\n'
      printf 'DB_USER=app\n'
      printf 'DB_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    } >"$credentials_file"
    chmod 600 "$credentials_file"
  fi

  # shellcheck disable=SC1090
  . "$credentials_file"
  export DB_NAME DB_USER DB_PASSWORD
}

ensure_postgres_cert() {
  local cert_dir="$WORKTREE_DB_DIR/tls"
  local key_file="$cert_dir/server.key"
  local cert_file="$cert_dir/server.crt"

  ensure_dir "$cert_dir"

  if [[ ! -f "$key_file" || ! -f "$cert_file" ]]; then
    openssl req \
      -x509 \
      -newkey rsa:2048 \
      -sha256 \
      -days 3650 \
      -nodes \
      -subj "/CN=$DB_HOST" \
      -addext "subjectAltName=DNS:$DB_HOST,DNS:localhost" \
      -keyout "$key_file" \
      -out "$cert_file" >/dev/null 2>&1
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
  fi

  export PG_TLS_KEY_FILE="$key_file"
  export PG_TLS_CERT_FILE="$cert_file"
}

write_connection_outputs() {
  local env_file="$WORKTREE_LOCAL_DIR/db.env"
  local text_file="$WORKTREE_LOCAL_DIR/db-connection.txt"

  cat >"$env_file" <<EOF
export PGHOST=$DB_HOST
export PGHOSTADDR=127.0.0.1
export PGPORT=5432
export PGDATABASE=$DB_NAME
export PGUSER=$DB_USER
export PGPASSWORD=$DB_PASSWORD
export PGSSLMODE=require
export DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require
EOF

  chmod 600 "$env_file"

  cat >"$text_file" <<EOF
host=$DB_HOST
port=5432
database=$DB_NAME
user=$DB_USER
sslmode=require

DATABASE_URL:
postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require

psql example:
PGPASSWORD=$DB_PASSWORD psql "host=$DB_HOST port=5432 dbname=$DB_NAME user=$DB_USER sslmode=require"
EOF

  chmod 600 "$text_file"
}
