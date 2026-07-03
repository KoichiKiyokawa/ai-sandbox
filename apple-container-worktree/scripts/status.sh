#!/usr/bin/env bash
# Show running containers + hostnames + API status for the current worktree.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

wt_init

DB_C=$(c_name db); REDIS_C=$(c_name redis); API_C=$(c_name api)
PORT=$(api_port)

print_row() { printf '  %-6s %-22s %-12s %-18s\n' "$1" "$2" "$3" "$4"; }

echo "Worktree : $WT"
echo "Domain   : $AC_DOMAIN"
echo
print_row "SVC" "CONTAINER (DNS name)" "STATE" "VOLUME"
print_row "---" "---------------------" "--------" "------"
for svc in "db:$DB_C:$(vol_name pg)" "redis:$REDIS_C:$(vol_name redis)" "api:$API_C:-"; do
  IFS=: read -r name cname vol <<< "$svc"
  print_row "$name" "$cname" "$(container_state "$cname")" "$vol"
done
echo

echo "API -> http://127.0.0.1:$PORT"
if curl --max-time 4 -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  curl -s "http://127.0.0.1:$PORT/" | jq . 2>/dev/null || curl -s "http://127.0.0.1:$PORT/"
else
  echo "  (api not responding yet — wait a few seconds and re-run)"
fi
