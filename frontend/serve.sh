#!/usr/bin/env bash
# Serve the Gift Islands frontend on http://127.0.0.1:5173 (backend must be running: bash start.sh).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5173}"
echo "赠岛前端：http://127.0.0.1:${PORT}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR"
