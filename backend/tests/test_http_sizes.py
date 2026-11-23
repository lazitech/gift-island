from concurrent.futures import Future
from pathlib import Path

from fastapi.testclient import TestClient

from giftislands_backend.app import create_app
from giftislands_backend.config import Settings
from giftislands_backend.positions import describe_move, position_response


class ClassicFakeEngine:
    def __init__(self, settings):
        self.catalog = {"verification": {"status": "verified"}}

    @property
    def busy(self):
        return False

    def model_summaries(self):
        return []

    def submit(self, state, level, simulations, symmetry, seed):
        action = int(state.legal_actions()[0])
        next_state = state.play(action)
        future = Future()
        future.set_result({
            "requested_position_key": position_response(state)["position_key"],
            "move": describe_move(action, state.player, state.n),
            "position": position_response(next_state),
            "model": {"level": level, "label": "经典搜索", "step": 0, "sha256": ""},
            "search": {"simulations": 1, "symmetry": "none", "seed": seed or 1,
                       "signed_value": 0.0, "elapsed_ms": 0.1, "exact_endgame": 0, "depth": 1},
        })
        return future

    def close(self):
        pass


def test_supported_sizes_and_classic_default():
    settings = Settings(models_dir=Path(__file__).parents[1] / "models", classic_time_ms=50)
    client = TestClient(create_app(settings, engine_factory=ClassicFakeEngine))
    with client:
        for n in (7, 11):
            board = [0] * (n * n)
            validated = client.post("/api/v1/positions/validate", json={"board": board})
            assert validated.status_code == 200
            assert validated.json()["board_size"] == n
            played = client.post("/api/v1/play-move", json={"board": board, "self_point": [0, 0], "opponent_point": [0, 1]})
            assert played.status_code == 200
            moved = client.post("/api/v1/ai-move", json={"board": board, "simulations": 2048, "symmetry": "ensemble"})
            assert moved.status_code == 200
            assert moved.json()["model"]["level"] == "classic"


def test_neural_level_is_unavailable_on_non_nine_board():
    settings = Settings(models_dir=Path(__file__).parents[1] / "models", classic_time_ms=50)
    client = TestClient(create_app(settings, engine_factory=ClassicFakeEngine))
    with client:
        response = client.post("/api/v1/ai-move", json={"board": [0] * 49, "level": "best"})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "level_unavailable"

