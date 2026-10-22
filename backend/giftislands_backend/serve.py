"""One-process local server; keep the lock alive until uvicorn exits."""
import fcntl
import os
from pathlib import Path

import uvicorn

from .config import ROOT


def main():
    runtime = ROOT / ".runtime"
    runtime.mkdir(exist_ok=True)
    with (runtime / "server.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("This project's backend is already running")
        host = os.getenv("GIFTISLANDS_HOST", "127.0.0.1")
        port = int(os.getenv("GIFTISLANDS_PORT", "8765"))
        if not 1 <= port <= 65535:
            raise SystemExit("Invalid GIFTISLANDS_PORT")
        uvicorn.run("giftislands_backend.app:app", host=host, port=port, workers=1,
                    timeout_keep_alive=5, timeout_graceful_shutdown=150, log_level="info")


if __name__ == "__main__":
    main()
