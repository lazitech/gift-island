"""Play the classical search against the built-in greedy baseline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from giftisland.classic import choose_move
from giftisland.game import GameState


def play_game(n: int, budget_ms: int, classic_player: int, seed: int) -> int:
    state = GameState(n=n)
    rng = np.random.default_rng(seed)
    while not state.terminal:
        if state.player == classic_player:
            action = choose_move(state, budget_ms, seed + state.player).action
        else:
            action = state.greedy_action(rng)
        state = state.play(action)
    black, white = state.scores()
    winner = 1 if black > white else 2 if white > black else 0
    return 1 if winner == classic_player else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, choices=(7, 9, 11), default=7)
    parser.add_argument("--games", type=int, default=10)
    parser.add_argument("--budget-ms", type=int, default=300)
    args = parser.parse_args()
    wins = 0
    for game in range(args.games):
        wins += play_game(args.size, args.budget_ms, 1 if game % 2 == 0 else 2, game)
    print(f"n={args.size} games={args.games} budget_ms={args.budget_ms} classic_wins={wins} win_rate={wins / args.games:.3f}")


if __name__ == "__main__":
    main()

