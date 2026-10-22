#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TASK_ROOT"
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
exec "$TASK_ROOT/.venv/bin/python" "$TASK_ROOT/scripts/manage.py" start
