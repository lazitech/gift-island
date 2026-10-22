#!/usr/bin/env python3
"""Start/stop only this project's own local API process."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
PIDFILE = RUNTIME / "server.json"


def identity(pid):
    proc = Path("/proc") / str(pid)
    try:
        fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
        if fields[0] in {"Z", "X"}:
            return None
        return {"pid": pid, "start_ticks": int(fields[19]),
                "argv": [a.decode() for a in (proc / "cmdline").read_bytes().split(b"\0") if a],
                "cwd": str((proc / "cwd").resolve())}
    except (FileNotFoundError, ProcessLookupError):
        return None


def owned(record):
    current = identity(record["pid"])
    if current is None:
        return None
    if (current["start_ticks"] != record["start_ticks"] or current["cwd"] != str(ROOT)
            or "giftislands_backend.serve" not in current["argv"]):
        raise RuntimeError("PID identity changed; refusing to signal another process")
    return current


def read_record():
    return json.loads(PIDFILE.read_text()) if PIDFILE.exists() else None


def health(port):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(f"http://127.0.0.1:{port}/healthz", timeout=2) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "stop", "status"])
    args = parser.parse_args()
    RUNTIME.mkdir(exist_ok=True)
    with (RUNTIME / "manager.lock").open("a") as manager_lock:
        fcntl.flock(manager_lock, fcntl.LOCK_EX)
        record = read_record()
        current = owned(record) if record else None
        if args.action == "status":
            if not current:
                print("Backend is stopped")
                return
            print(json.dumps({"pid": current["pid"], "url": record["url"], "health": health(record["port"])}, ensure_ascii=False))
            return
        if args.action == "stop":
            if not current:
                print("Backend is already stopped")
                return
            os.kill(current["pid"], signal.SIGTERM)
            deadline = time.monotonic() + 180
            while owned(record):
                if time.monotonic() >= deadline:
                    raise RuntimeError("Backend is still finishing its current job; no forced kill was sent")
                time.sleep(.2)
            PIDFILE.unlink(missing_ok=True)
            print("Backend stopped")
            return
        if current:
            print(f"Backend already running: {record['url']} (PID {current['pid']})")
            return
        port = int(os.getenv("GIFTISLANDS_PORT", "8765"))
        if not 1 <= port <= 65535:
            raise ValueError("Invalid GIFTISLANDS_PORT")
        # Refuse to mistake an unrelated application on this port for our server.
        import socket
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((os.getenv("GIFTISLANDS_HOST", "127.0.0.1"), port))
            except OSError as exc:
                raise RuntimeError(f"Port {port} is already in use") from exc
        command = [str(ROOT / ".venv/bin/python"), "-m", "giftislands_backend.serve"]
        with (RUNTIME / "server.log").open("a") as log:
            process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                                       stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True, env={**os.environ, "PYTHONUNBUFFERED": "1"})
        current = identity(process.pid)
        if current is None:
            raise RuntimeError("Server exited during startup; see .runtime/server.log")
        record = {**current, "port": port, "host": os.getenv("GIFTISLANDS_HOST", "127.0.0.1"),
                  "url": f"http://127.0.0.1:{port}", "log": str(RUNTIME / "server.log")}
        temporary = PIDFILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(record, indent=2) + "\n")
        os.replace(temporary, PIDFILE)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("Server exited during startup; see .runtime/server.log")
            try:
                data = health(port)
                if data.get("ready"):
                    print(f"Gift Islands backend ready: {record['url']}")
                    print(f"API docs: {record['url']}/docs")
                    print(f"PID: {process.pid}; log: {record['log']}")
                    return
            except (OSError, urllib.error.URLError, ValueError):
                pass
            time.sleep(.3)
        raise RuntimeError("Startup is taking longer than 90 seconds; inspect .runtime/server.log")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
