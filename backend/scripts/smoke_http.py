#!/usr/bin/env python3
"""Exercise the running API with real models, including one complete game."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import json
from pathlib import Path
import time

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--output", default=".runtime/http-smoke.json")
    args = parser.parse_args()
    checks = []
    with httpx.Client(base_url=args.base_url, timeout=120, trust_env=False) as client:
        def get(path):
            response = client.get(path)
            response.raise_for_status()
            return response.json()

        def post(path, body):
            response = client.post(path, json=body)
            response.raise_for_status()
            return response.json()

        health = get("/healthz")
        assert health["ready"] and health["model_count"] == 4
        catalog = get("/api/v1/models")
        assert [m["level"] for m in catalog["models"]] == ["level1", "level2", "level3", "best"]
        schema = get("/openapi.json")
        assert "/api/v1/ai-move" in schema["paths"]
        assert client.get("/docs").status_code == 200
        checks.append("health, model registry, OpenAPI and interactive docs")
        origin = "http://localhost:5173"
        response = client.options("/api/v1/ai-move", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        assert response.status_code == 200 and response.headers["access-control-allow-origin"] == origin
        denied = client.options("/api/v1/ai-move", headers={"Origin": "https://unrelated.invalid", "Access-Control-Request-Method": "POST"})
        assert denied.status_code == 400 and "access-control-allow-origin" not in denied.headers
        checks.append("browser CORS preflight allow and reject")
        assert client.post("/api/v1/ai-move", json={"board": [1]+[0]*80}).status_code == 422
        assert client.post("/api/v1/ai-move", json={"player": 2}).status_code == 422
        assert client.post("/api/v1/ai-move", json={"level": "unknown"}).status_code == 422
        assert client.post("/api/v1/play-move", json={"self_point": [0,0], "opponent_point": [0,0]}).status_code == 422
        checks.append("malformed positions, turns, levels and duplicate points rejected")
        moves = []
        for level in ["level1", "level2", "level3", "best"]:
            data = post("/api/v1/ai-move", {"level": level, "simulations": 128, "seed": 42})
            assert data["search"]["simulations"] == 128 and data["position"]["move_number"] == 1
            assert data["position"]["board"].count(1) == data["position"]["board"].count(2) == 1
            moves.append({"level": level, "step": data["model"]["step"], "move": data["move"], "search": data["search"]})
        repeat = post("/api/v1/ai-move", {"level": "best", "simulations": 128, "seed": 42})
        assert repeat["move"] == moves[-1]["move"]
        checks.append("all four real models, actual 128-visit budgets and reproducible seed")
        human = post("/api/v1/play-move", {"self_point": [4,4], "opponent_point": [0,0]})
        assert human["position"]["player"] == 2
        white = post("/api/v1/ai-move", {"board": human["position"]["board"], "player": 2, "level": "best", "simulations": 128, "seed": 9})
        assert white["move"]["player"] == 2 and white["position"]["player"] == 1 and white["position"]["move_number"] == 2
        checks.append("human two-stone move followed by a real white AI response")
        # A real longer job must not block health or admit a simultaneous job.
        with ThreadPoolExecutor(max_workers=1) as pool:
            job = pool.submit(post, "/api/v1/ai-move", {"level": "best", "simulations": 512, "symmetry": "ensemble", "seed": 101})
            deadline = time.monotonic() + 10
            while not get("/healthz")["busy"]:
                assert not job.done() and time.monotonic() < deadline
                time.sleep(.01)
            tick = time.perf_counter()
            responsive = get("/healthz")
            health_ms = (time.perf_counter()-tick)*1000
            assert responsive["busy"] and health_ms < 2000
            busy = client.post("/api/v1/ai-move", json={"level": "best", "simulations": 1})
            assert busy.status_code == 503 and busy.headers["retry-after"] == "1"
            strong = job.result(timeout=120)
        assert strong["search"]["simulations"] == 512 and strong["search"]["symmetry"] == "ensemble"
        checks.append("real 512-visit D4 ensemble, nonblocking health and HTTP503 backpressure")
        state = {"board": [0]*81, "player": 1}
        trajectory = []
        levels = ["level1", "level2", "level3", "best"]
        for turn in range(40):
            before = state["board"]
            result = post("/api/v1/ai-move", {**state, "level": levels[turn%4], "simulations": 8, "seed": 500+turn})
            after = result["position"]
            assert after["move_number"] == turn+1 and after["player"] == 3-state["player"]
            assert after["board"].count(1) == after["board"].count(2) == turn+1
            assert sum(a != b for a,b in zip(before,after["board"])) == 2
            assert all(a == 0 or a == b for a,b in zip(before,after["board"]))
            trajectory.append({"turn": turn+1, "model": levels[turn%4], "move": result["move"], "search": result["search"]})
            state = {"board": after["board"], "player": after["player"]}
        assert after["terminal"] and after["empty_count"] == 1 and after["result"] != "ongoing"
        assert client.post("/api/v1/ai-move", json=state).status_code == 409
        checks.append("full 40-move game over HTTP, immutable stones, final scores and terminal409")
        assert not get("/healthz")["busy"]
        report = {"captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "status": "passed",
                  "base_url": args.base_url, "checks": checks, "models": catalog["models"],
                  "empty_board_128_visits": moves, "ensemble_512_search": strong["search"],
                  "health_latency_during_search_ms": health_ms, "final_position": after,
                  "full_game_moves": trajectory, "training_used": False}
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
        print(json.dumps({"status": "passed", "checks": len(checks), "four_model_search_ms": {m["level"]:m["search"]["elapsed_ms"] for m in moves},
                          "best_512_ensemble_ms": strong["search"]["elapsed_ms"], "health_latency_while_busy_ms": health_ms,
                          "complete_game_moves": len(trajectory), "final_scores": after["scores"], "report": args.output}, ensure_ascii=False))


if __name__ == "__main__":
    main()
