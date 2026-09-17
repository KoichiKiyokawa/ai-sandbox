#!/usr/bin/env bash
set -eu

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--build-only" ]; }; then
  echo "Usage: $0 [--build-only]" >&2
  exit 2
fi

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/.local"
(
  cd "$project_dir/api"
  if command -v mise >/dev/null; then
    mise exec go@1.26.5 -- go build -o "$project_dir/.local/task-router" ./cmd/task-router
  else
    go build -o "$project_dir/.local/task-router" ./cmd/task-router
  fi
)
if [ "${1:-}" = "--build-only" ]; then
  exit 0
fi
exec "$project_dir/.local/task-router" -routes "$project_dir/dev/task-hosts.json" -listen "${TASK_ROUTER_LISTEN:-127.0.0.1:80}"
