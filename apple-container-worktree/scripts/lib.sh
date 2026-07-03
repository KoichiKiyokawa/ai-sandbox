# shellcheck shell=bash
# Shared helpers for the apple/container + git worktree demo.
# Sourced by the other scripts in this directory; not executed directly.

# Resolve project root (parent of this scripts/ dir), following symlinks.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Optional .env overrides (see .env.example).
[ -f "$ROOT/.env" ] && . "$ROOT/.env"

# --- Defaults (overridable via env / .env) ---------------------------------
: "${AC_DOMAIN:=local}"                            # DNS suffix, e.g. local / test
: "${AC_POSTGRES_IMAGE:=docker.io/library/postgres:17}"
: "${AC_REDIS_IMAGE:=docker.io/library/redis:7-alpine}"
: "${AC_API_IMAGE:=ac-worktree-api:local}"
: "${AC_NETWORK:=default}"                         # apple container network

# --- Worktree detection ----------------------------------------------------

# Print the git worktree name: "main" for the main worktree, or the linked
# worktree identifier (basename under .git/worktrees/<name>) otherwise.
wt_name() {
  local gd
  gd=$(git rev-parse --absolute-git-dir 2>/dev/null) || {
    echo "ERROR: not a git repository. Run: git init && git commit -m 'initial'" >&2
    return 1
  }
  case "$gd" in
    */.git/worktrees/*) printf '%s' "${gd##*/.git/worktrees/}" ;;
    *) printf '%s' "main" ;;
  esac
}

# Sanitize a name to a DNS-safe label ([a-z0-9-]).
sanitize() {
  local s="$1"
  s=$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')
  s=$(printf '%s' "$s" | tr -c '[:alnum:]-' '-')
  s=$(printf '%s' "$s" | sed -E 's:-+:-:g; s:^-+::; s:-+$::')
  printf '%s' "$s"
}

# Set WT (sanitized worktree name) and PREFIX ("main" -> "", else "<wt>.").
wt_init() {
  local raw
  raw=$(wt_name) || return 1
  WT=$(sanitize "$raw")
  if [ "$WT" = "main" ]; then
    PREFIX=""
  else
    PREFIX="$WT."
  fi
}

# Container name == in-network DNS hostname for a service.
#   main worktree:        db.local
#   linked worktree foo:  foo.db.local
c_name() { printf '%s%s.%s' "$PREFIX" "$1" "$AC_DOMAIN"; }

# Per-worktree named volume.
vol_name() { printf '%s-%s-data' "$WT" "$1"; }

# Published API port on 127.0.0.1. Main -> 8080; linked -> deterministic 18xxx.
api_port() {
  if [ -n "${AC_API_PORT:-}" ]; then printf '%s' "$AC_API_PORT"; return; fi
  if [ "$WT" = "main" ]; then printf '8080'; return; fi
  local h
  h=$(printf '%s' "$WT" | cksum | awk '{print $1}')
  printf '%s' $(( 18000 + (h % 1000) ))
}

# --- apple/container state helpers ----------------------------------------

# Print container state: running | created | stopped | missing
container_state() {
  container inspect "$1" 2>/dev/null | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d[0].get("status",{}).get("state","unknown"))
except Exception:
  print("missing")'
}

# Create a named volume if it does not already exist.
ensure_volume() {
  if ! container volume list 2>/dev/null | awk 'NR>1{print $1}' | grep -qx -- "$1"; then
    container volume create "$1" >/dev/null
  fi
}

# Ensure the apple container DNS domain is provisioned, else guide the user.
ensure_domain() {
  if container system dns list 2>/dev/null | awk 'NR>1{print $1}' | grep -qx -- "$AC_DOMAIN"; then
    return 0
  fi
  cat >&2 <<EOF
ERROR: apple container DNS domain '$AC_DOMAIN' is not provisioned.

Create it once (needs sudo):
    sudo container system dns create $AC_DOMAIN

Or use the pre-provisioned '.test' domain with zero setup:
    AC_DOMAIN=test ./scripts/up.sh

See README.md -> "DNS setup" for details and the .local/mDNS caveat.
EOF
  return 1
}
