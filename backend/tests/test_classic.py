import numpy as np

from giftisland.classic import ClassicSearcher, choose_move
from giftisland.game import GameState, minimax_cached


def test_classic_returns_legal_moves_on_supported_sizes():
    for n in (7, 11):
        state = GameState(n=n)
        result = choose_move(state, time_ms=50, seed=7)
        assert result.action in state.legal_actions()

        action = int(state.legal_actions()[10])
        middle = state.play(action)
        assert choose_move(middle, time_ms=50, seed=7).action in middle.legal_actions()

        board = np.zeros(n * n, dtype=np.int8)
        empty = {0, 1, 2}
        for index in range(n * n):
            if index not in empty:
                board[index] = 1 if index % 2 else 2
        near = GameState(n=n, board=board, player=1 if np.count_nonzero(board == 1) % 2 == 0 else 2)
        assert choose_move(near, time_ms=50, seed=7).action in near.legal_actions()


def test_classic_solves_a_forced_tiny_endgame():
    board = [
        1, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2,
        1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 0, 1,
        2, 1, 2, 1, 2, 1, 2, 1, 2,
    ]
    state = GameState(n=7, board=board, player=2)
    result = choose_move(state, time_ms=100, seed=3)
    values = [-minimax_cached(state.play(int(action))) for action in state.legal_actions()]
    assert max(values) == 1
    assert -minimax_cached(state.play(result.action)) == 1


def test_classic_is_deterministic_for_a_seed():
    state = GameState(n=11)
    first = choose_move(state, time_ms=50, seed=123)
    second = choose_move(state, time_ms=50, seed=123)
    assert first.action == second.action


def test_transposition_bounds_match_plain_minimax():
    def plain(searcher, state, depth):
        if state.terminal or depth == 0:
            return searcher._evaluate(state)
        return max(-plain(searcher, state.play(int(action)), depth - 1)
                   for action in state.legal_actions())

    for seed in (2, 5, 11):
        rng = np.random.default_rng(seed)
        empty = set(rng.choice(49, 5, replace=False).tolist())
        board = np.zeros(49, dtype=np.int8)
        for offset, index in enumerate(cell for cell in range(49) if cell not in empty):
            board[index] = 1 if offset % 2 else 2
        state = GameState(n=7, board=board,
                          player=1 if np.count_nonzero(board == 1) % 2 == 0 else 2)
        searcher = ClassicSearcher(state, time_ms=10000, seed=seed)
        assert np.isclose(searcher._negamax(state, 3, -2.0, 2.0), plain(searcher, state, 3))

