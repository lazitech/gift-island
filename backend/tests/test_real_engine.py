from pathlib import Path
import threading
import time

import pytest

from giftisland.game import GameState, action_points
from giftislands_backend.config import Settings
from giftislands_backend.engine import EngineBusy, InferenceEngine


ROOT = Path(__file__).resolve().parents[1]
LEVELS = ("level1", "level2", "level3", "best")


@pytest.fixture(scope="module")
def real_engine():
    settings = Settings(
        models_dir=ROOT / "models",
        torch_threads=1,
        search_threads=1,
        default_simulations=1,
        max_simulations=4,
        default_symmetry="none",
        request_timeout=120.0,
    )
    engine = InferenceEngine(settings)
    try:
        yield engine
    finally:
        engine.close()


def infer(engine, state, level="best", seed=123):
    future = engine.submit(state, level, simulations=1, symmetry="none", seed=seed)
    result = future.result(timeout=120)
    deadline = time.monotonic() + 5.0
    while engine.busy and time.monotonic() < deadline:
        time.sleep(0.01)
    assert engine.busy is False
    return result


def assert_legal_response(result, state):
    assert result["search"]["simulations"] == 1
    move = result["move"]
    assert move["player"] == state.player
    assert move["self_point"] != move["opponent_point"]
    x = move["self_point"][0] * 9 + move["self_point"][1]
    y = move["opponent_point"][0] * 9 + move["opponent_point"][1]
    assert action_points(move["action_index"], 9) == (x, y)
    next_state = state.play(move["action_index"])
    assert result["position"]["board"] == next_state.board.tolist()
    assert result["position"]["player"] == next_state.player


def test_all_four_real_cpu_models_execute_one_simulation(real_engine):
    state = GameState()
    for level in LEVELS:
        result = infer(real_engine, state, level=level, seed=100 + len(level))
        assert result["model"]["level"] == level
        assert_legal_response(result, state)


def test_real_cpu_search_is_seed_reproducible_and_handles_nonempty_position(real_engine):
    empty = GameState()
    first = infer(real_engine, empty, level="best", seed=777)
    second = infer(real_engine, empty, level="best", seed=777)
    assert first["move"] == second["move"]
    assert first["position"]["board"] == second["position"]["board"]
    assert first["search"]["signed_value"] == second["search"]["signed_value"]

    board = [0] * 81
    board[0], board[1] = 1, 2
    nonempty = GameState(n=9, board=board, player=2)
    result = infer(real_engine, nonempty, level="best", seed=778)
    assert_legal_response(result, nonempty)
    assert result["position"]["board"].count(1) == 2
    assert result["position"]["board"].count(2) == 2


def test_real_cpu_exact_endgame_returns_a_terminal_child(real_engine):
    # 39 pairs leave three empty cells.  The native exact-endgame solver is
    # therefore used at the root; one legal double-placement leaves one empty.
    state = GameState(n=9, board=[1, 2] * 39 + [0, 0, 0], player=2)
    result = infer(real_engine, state, level="best", seed=779)
    assert_legal_response(result, state)
    assert result["position"]["terminal"] is True
    assert result["position"]["empty_count"] == 1


def test_real_engine_admits_only_one_job_at_a_time(real_engine, monkeypatch):
    started = threading.Event()
    release = threading.Event()

    def blocked_infer(state, level, simulations, symmetry, seed):
        started.set()
        assert release.wait(5.0)
        return {"ok": True}

    monkeypatch.setattr(real_engine, "_infer", blocked_infer)
    future = real_engine.submit(GameState(), "best", 1, "none", 781)
    assert started.wait(5.0)
    with pytest.raises(EngineBusy):
        real_engine.submit(GameState(), "best", 1, "none", 782)
    try:
        release.set()
        assert future.result(timeout=5.0) == {"ok": True}
    finally:
        release.set()
    deadline = time.monotonic() + 5.0
    while real_engine.busy and time.monotonic() < deadline:
        time.sleep(0.01)
    assert real_engine.busy is False
