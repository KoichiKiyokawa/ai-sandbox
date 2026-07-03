#!/usr/bin/env bash
# Start postgres + redis + api for the current git worktree.
# Idempotent: starts existing stopped containers, creates missing ones.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

ensure_domain
wt_init

DB_C=$(c_name db);    REDIS_C=$(c_name redis); API_C=$(c_name api)
PG_VOL=$(vol_name pg); REDIS_VOL=$(vol_name redis)
PORT=$(api_port)

echo "Worktree : $WT"
echo "Domain   : $AC_DOMAIN"
echo "Prefix   : '${PREFIX}'  (bare names in main, '<wt>.' in linked worktrees)"
echo "API URL  : http://127.0.0.1:$PORT"
echo

# Build the API image once.
if ! container image list 2>/dev/null | awk 'NR>1{print $1":"$2}' | grep -qx -- "$AC_API_IMAGE"; then
  echo "=> building API image $AC_API_IMAGE ..."
  container build -t "$AC_API_IMAGE" -f "$ROOT/api/Dockerfile" "$ROOT/api/"
  echo
fi

ensure_volume "$PG_VOL"
ensure_volume "$REDIS_VOL"

# --- postgres ---
case "$(container_state "$DB_C")" in
  running) echo "db     : already running ($DB_C)" ;;
  missing)
    # Mount the volume at /var/lib/postgresql (the parent), not at PGDATA
    # directly. A fresh apple/container volume contains a lost+found dir,
    # which makes postgres initdb refuse to initialize. With the volume at
    # the parent, PGDATA (/var/lib/postgresql/data) is a clean subdir.
    container run -d --name "$DB_C" --network "$AC_NETWORK" \
      -e POSTGRES_DB=app -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app \
      -v "$PG_VOL:/var/lib/postgresql" \
      --mount "source=$ROOT/db,target=/docker-entrypoint-initdb.d,readonly" \
      "$AC_POSTGRES_IMAGE" >/dev/null
    echo "db     : created + started ($DB_C)"
    ;;
  *)
    container start "$DB_C" >/dev/null
    echo "db     : started ($DB_C)"
    ;;
esac

# --- redis ---
case "$(container_state "$REDIS_C")" in
  running) echo "redis  : already running ($REDIS_C)" ;;
  missing)
    container run -d --name "$REDIS_C" --network "$AC_NETWORK" \
      -v "$REDIS_VOL:/data" \
      "$AC_REDIS_IMAGE" >/dev/null
    echo "redis  : created + started ($REDIS_C)"
    ;;
  *)
    container start "$REDIS_C" >/dev/null
    echo "redis  : started ($REDIS_C)"
    ;;
esac

# --- api ---
case "$(container_state "$API_C")" in
  running) echo "api    : already running ($API_C)" ;;
  missing)
    container run -d --name "$API_C" --network "$AC_NETWORK" \
      -p "127.0.0.1:$PORT:8080" \
      -e WORKTREE="$WT" \
      -e POSTGRES_HOST="$(c_name db)" -e POSTGRES_PORT=5432 \
      -e POSTGRES_DB=app -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app \
      -e REDIS_HOST="$(c_name redis)" -e REDIS_PORT=6379 \
      "$AC_API_IMAGE" >/dev/null
    echo "api    : created + started ($API_C)"
    ;;
  *)
    container start "$API_C" >/dev/null
    echo "api    : started ($API_C)"
    ;;
esac

echo
echo "All up. Check with: ./scripts/status.sh   |   curl http://127.0.0.1:$PORT"
