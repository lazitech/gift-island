from concurrent.futures import Future
import json
from pathlib import Path
import threading

import pytest
from fastapi.testclient import TestClient

from giftislands_backend.app import create_app
from giftislands_backend.config import Settings
from giftislands_backend.engine import EngineBusy
from giftisland.game import GameState
from giftislands_backend.positions import describe_move, position_response


ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "models" / "models.json").read_text())
LEVELS = ("level1", "level2", "level3", "best")


def response_for(state, level, simulations, symmetry, seed):
    """Build the same response shape as the production engine for HTTP tests."""
    action = int(state.legal_actions()[0])
    next_state = state.play(action)
    item = CATALOG["models"][level]
    return {
        "requested_position_key": position_response(state)["position_key"],
        "model": {"level": level, **{key: item[key] for key in ("label", "step", "sha256")}},
        "move": describe_move(action, state.player),
        "position": position_response(next_state),
        "search": {
            "simulations": simulations,
            "symmetry": symmetry,
            "seed": 17 if seed is None else seed,
            "signed_value": 0.0,
            "elapsed_ms": 0.1,
            "exact_endgame": 5,
        },
    }


class ImmediateFakeEngine:
    """Small Future-returning engine used to isolate HTTP behavior."""

    def __init__(self, settings):
        self.settings = settings
        self.catalog = CATALOG
        self.submissions = []
        self._busy = False
        self.closed = False

    @property
    def busy(self):
        return self._busy

    def model_summaries(self):
        return [
            {"level": level, **{key: CATALOG["models"][level][key] for key in ("label", "step", "sha256")}}
            for level in LEVELS
        ]

    def submit(self, state, level, simulations, symmetry, seed=None):
        if self._busy:
            raise EngineBusy("fake engine busy")
        self._busy = True
        self.submissions.append((state, level, simulations, symmetry, seed))
        future = Future()
        future.add_done_callback(lambda _: self._release())
        future.set_result(response_for(state, level, simulations, symmetry, seed))
        return future

    def _release(self):
        self._busy = False

    def close(self):
        self.closed = True


class BlockingFakeEngine(ImmediateFakeEngine):
    """First job blocks until explicitly resolved, then jobs complete normally."""

    def __init__(self, settings):
        super().__init__(settings)
        self.blocked_future = None
        self.blocked_result = None
        self._block_next = True
        self._lock = threading.Lock()

    def submit(self, state, level, simulations, symmetry, seed=None):
        with self._lock:
            if self._busy:
                raise EngineBusy("fake engine busy")
            self._busy = True
            self.submissions.append((state, level, simulations, symmetry, seed))
            future = Future()
            future.add_done_callback(lambda _: self._release())
            if self._block_next:
                self._block_next = False
                self.blocked_future = future
                self.blocked_result = response_for(state, level, simulations, symmetry, seed)
                return future
            future.set_result(response_for(state, level, simulations, symmetry, seed))
            return future

    def resolve_blocked(self):
        assert self.blocked_future is not None
        self.blocked_future.set_result(self.blocked_result)


@pytest.fixture
def client_factory():
    def make(engine=None, *, request_timeout=1.0, max_simulations=4):
        engine = engine or ImmediateFakeEngine(None)
        settings = Settings(
            models_dir=ROOT / "models",
            torch_threads=1,
            search_threads=1,
            default_simulations=2,
            max_simulations=max_simulations,
            default_symmetry="none",
            request_timeout=request_timeout,
        )
        app = create_app(settings, engine_factory=lambda _settings: engine)
        return TestClient(app), engine

    return make


@pytest.fixture
def empty_board():
    return [0] * 81


@pytest.fixture
def terminal_board():
    # 40 black, 40 white and one empty cell.  Black occupies two separated
    # rectangles, so the known terminal score is black=2, white=1.
    board = [
        1, 1, 1, 1, 1, 1, 1, 1, 2,
        1, 1, 1, 1, 1, 1, 1, 1, 2,
        1, 1, 1, 1, 1, 1, 1, 1, 2,
        2, 2, 2, 2, 2, 2, 2, 2, 2,
        2, 2, 2, 2, 1, 1, 1, 1, 2,
        2, 2, 2, 2, 1, 1, 1, 1, 2,
        2, 2, 2, 2, 1, 1, 1, 1, 2,
        2, 2, 2, 2, 1, 1, 1, 1, 2,
        2, 2, 2, 2, 2, 2, 2, 2, 0,
    ]
    assert len(board) == 81
    return board
