#!/usr/bin/env bash
# Stop and remove the worktree's containers and named volumes.
# --keep-volumes: stop+remove containers but keep the data volumes.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

wt_init

DB_C=$(c_name db); REDIS_C=$(c_name redis); API_C=$(c_name api)
PG_VOL=$(vol_name pg); REDIS_VOL=$(vol_name redis)
KEEP_VOLUMES=0
[ "${1:-}" = "--keep-volumes" ] && KEEP_VOLUMES=1

stop_rm() {
  local c="$1" label="$2"
  case "$(container_state "$c")" in
    running) container stop "$c" >/dev/null && container rm "$c" >/dev/null && echo "$label: stopped + removed ($c)" ;;
    missing) echo "$label: not present ($c)" ;;
    *) container rm "$c" >/dev/null && echo "$label: removed ($c)" ;;
  esac
}

stop_rm "$API_C"  "api"
stop_rm "$REDIS_C" "redis"
stop_rm "$DB_C"   "db"

if [ "$KEEP_VOLUMES" -eq 0 ]; then
  for v in "$PG_VOL" "$REDIS_VOL"; do
    container volume rm "$v" >/dev/null 2>&1 && echo "volume: removed ($v)" || true
  done
else
  echo "volumes kept: $PG_VOL, $REDIS_VOL"
fi
