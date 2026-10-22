import time


def test_models_and_cors(client_factory):
    client, _ = client_factory()
    with client:
        allowed = client.get("/api/v1/models", headers={"Origin": "http://localhost:5173"})
        assert allowed.status_code == 200
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
        payload = allowed.json()
        assert [item["level"] for item in payload["models"]] == ["level1", "level2", "level3", "best"]
        assert payload["default_level"] == "best"
        assert payload["verification"]["status"] == "verified"

        preflight = client.options(
            "/api/v1/ai-move",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "POST" in preflight.headers["access-control-allow-methods"]

        stranger = client.get("/api/v1/models", headers={"Origin": "https://not-the-local-ui.example"})
        assert stranger.status_code == 200
        assert "access-control-allow-origin" not in stranger.headers


def test_position_json_and_turn_validation(client_factory, empty_board):
    client, _ = client_factory()
    with client:
        wrong_length = client.post("/api/v1/positions/validate", json={"board": [0] * 80})
        assert wrong_length.status_code == 422

        non_strict_integer = client.post(
            "/api/v1/positions/validate", json={"board": [0] * 80 + [0.0]}
        )
        assert non_strict_integer.status_code == 422

        unbalanced = [1] + empty_board[1:]
        response = client.post("/api/v1/positions/validate", json={"board": unbalanced})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_position"

        one_pair = [1, 2] + [0] * 79
        wrong_player = client.post(
            "/api/v1/positions/validate", json={"board": one_pair, "player": 1}
        )
        assert wrong_player.status_code == 422
        assert wrong_player.json()["detail"]["code"] == "invalid_position"

        derived = client.post("/api/v1/positions/validate", json={"board": one_pair})
        assert derived.status_code == 200
        assert derived.json()["player"] == 2


def test_play_move_applies_both_points_and_rejects_illegal_pairs(client_factory, empty_board):
    client, _ = client_factory()
    with client:
        response = client.post(
            "/api/v1/play-move",
            json={"board": empty_board, "player": 1, "self_point": [0, 0], "opponent_point": [0, 1]},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["move"] == {
            "player": 1,
            "action_index": 1,
            "self_point": [0, 0],
            "opponent_point": [0, 1],
        }
        position = payload["position"]
        assert position["board"][:3] == [1, 2, 0]
        assert position["player"] == 2
        assert position["move_number"] == 1
        assert position["empty_count"] == 79
        assert position["scores"] == {"black": 1, "white": 1}
        assert position["result"] == "ongoing"

        same_point = client.post(
            "/api/v1/play-move",
            json={"board": empty_board, "player": 1, "self_point": [0, 0], "opponent_point": [0, 0]},
        )
        assert same_point.status_code == 422
        assert same_point.json()["detail"]["code"] == "invalid_position"

        occupied = client.post(
            "/api/v1/play-move",
            json={
                "board": [1, 2] + [0] * 79,
                "player": 2,
                "self_point": [0, 0],
                "opponent_point": [0, 2],
            },
        )
        assert occupied.status_code == 422
        assert occupied.json()["detail"]["code"] == "invalid_position"


def test_terminal_scores_and_game_finished_409(client_factory, terminal_board):
    client, _ = client_factory()
    with client:
        validated = client.post(
            "/api/v1/positions/validate", json={"board": terminal_board, "player": 1}
        )
        assert validated.status_code == 200
        position = validated.json()
        assert position["terminal"] is True
        assert position["empty_count"] == 1
        assert position["scores"] == {"black": 2, "white": 1}
        assert position["result"] == "black_win"

        move = client.post(
            "/api/v1/play-move",
            json={"board": terminal_board, "player": 1, "self_point": [8, 8], "opponent_point": [0, 8]},
        )
        assert move.status_code == 409
        assert move.json()["detail"]["code"] == "game_finished"

        ai = client.post("/api/v1/ai-move", json={"board": terminal_board, "player": 1, "simulations": 1})
        assert ai.status_code == 409
        assert ai.json()["detail"]["code"] == "game_finished"


def test_unknown_level_and_budget_limit(client_factory, empty_board):
    client, _ = client_factory(max_simulations=4)
    with client:
        unknown = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "unknown", "simulations": 1},
        )
        assert unknown.status_code == 422

        too_large = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "best", "simulations": 5},
        )
        assert too_large.status_code == 422
        assert too_large.json()["detail"]["code"] == "search_budget_exceeded"

        zero = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "best", "simulations": 0},
        )
        assert zero.status_code == 422


def test_timeout_keeps_real_job_slot_until_completion(client_factory, empty_board):
    from tests.conftest import BlockingFakeEngine

    engine = BlockingFakeEngine(None)
    client, _ = client_factory(engine, request_timeout=1.0)
    with client:
        first = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "best", "simulations": 1},
        )
        assert first.status_code == 504
        assert engine.busy is True

        second = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "best", "simulations": 1},
        )
        assert second.status_code == 503
        assert len(engine.submissions) == 1

        engine.resolve_blocked()
        deadline = time.monotonic() + 1.0
        while engine.busy and time.monotonic() < deadline:
            time.sleep(0.01)
        assert engine.busy is False

        third = client.post(
            "/api/v1/ai-move",
            json={"board": empty_board, "player": 1, "level": "best", "simulations": 1},
        )
        assert third.status_code == 200
        assert third.json()["search"]["simulations"] == 1
        assert len(engine.submissions) == 2
