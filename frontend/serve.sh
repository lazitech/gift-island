#!/usr/bin/env bash
# Serve the Gift Islands frontend on http://127.0.0.1:5173 (backend must be running: bash backend/start.sh).
# Responses carry Cache-Control: no-cache, so a reload always picks up edited files.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5173}"
echo "赠岛前端：http://127.0.0.1:${PORT}"
exec python3 - "$PORT" "$DIR" <<'PY'
import functools, http.server, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

port, root = int(sys.argv[1]), sys.argv[2]
server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root))
server.serve_forever()
PY
