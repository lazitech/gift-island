"""Play the classical search against the built-in greedy baseline."""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from giftisland.classic import choose_move
from giftisland.game import GameState


def play_game(n: int, nodes: int, time_ms: int, classic_player: int, seed: int):
    state = GameState(n=n)
    rng = np.random.default_rng(seed)
    elapsed = []
    while not state.terminal:
        if state.player == classic_player:
            started = time.perf_counter()
            action = choose_move(state, time_ms=time_ms, nodes=nodes, seed=seed + state.player).action
            elapsed.append((time.perf_counter() - started) * 1000)
        else:
            action = state.greedy_action(rng)
        state = state.play(action)
    black, white = state.scores()
    winner = 1 if black > white else 2 if white > black else 0
    return ("win" if winner == classic_player else "draw" if winner == 0 else "loss", elapsed)


def run_game(arguments):
    return play_game(*arguments)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, choices=(7, 9, 11), default=7)
    parser.add_argument("--games", type=int, default=10)
    parser.add_argument("--nodes", type=int, default=2500)
    parser.add_argument("--budget-ms", type=int, default=1500)
    parser.add_argument("--jobs", type=int, default=1)
    args = parser.parse_args()
    jobs = max(1, min(args.jobs, args.games))
    work = [(args.size, args.nodes, args.budget_ms, 1 if game % 2 == 0 else 2, game)
            for game in range(args.games)]
    if jobs == 1:
        results = [play_game(*item) for item in work]
    else:
        with ProcessPoolExecutor(max_workers=jobs) as pool:
            results = list(pool.map(run_game, work))
    wins = sum(result == "win" for result, _ in results)
    draws = sum(result == "draw" for result, _ in results)
    losses = sum(result == "loss" for result, _ in results)
    move_times = [elapsed for _, values in results for elapsed in values]
    average_ms = sum(move_times) / len(move_times) if move_times else 0.0
    print(f"n={args.size} games={args.games} nodes={args.nodes} budget_ms={args.budget_ms} "
          f"wins={wins} draws={draws} losses={losses} average_classic_move_ms={average_ms:.1f}")


if __name__ == "__main__":
    main()

