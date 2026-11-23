"""Small deterministic classical opponent for Gift Islands."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np

from .game import GameState, encode_action


@dataclass
class ClassicResult:
    action: int
    simulations: int
    seed: int
    signed_value: float
    depth: int | None
    exact_endgame: int = 0


class _SearchTimeout(Exception):
    pass


@dataclass
class _TTEntry:
    value: float
    bound: str
    best_action: int | None


class ClassicSearcher:
    def __init__(self, state: GameState, nodes: int = 2500, time_ms: int = 1500, seed: int = 0):
        self.root = state
        self.node_budget = nodes
        self.deadline = time.perf_counter() + time_ms / 1000.0
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.nodes = 0
        self.table: dict[tuple[bytes, int, int], _TTEntry] = {}
        self.completed_depth = 0

    @staticmethod
    def _neighbors(cell: int, n: int):
        row, col = divmod(cell, n)
        if row:
            yield cell - n
        if row + 1 < n:
            yield cell + n
        if col:
            yield cell - 1
        if col + 1 < n:
            yield cell + 1

    @classmethod
    def _labels(cls, board: np.ndarray, n: int, color: int) -> np.ndarray:
        labels = np.full(n * n, -1, dtype=np.int16)
        component = 0
        for cell in range(n * n):
            if board[cell] != color or labels[cell] >= 0:
                continue
            labels[cell] = component
            stack = [cell]
            while stack:
                current = stack.pop()
                for neighbor in cls._neighbors(current, n):
                    if board[neighbor] == color and labels[neighbor] < 0:
                        labels[neighbor] = component
                        stack.append(neighbor)
            component += 1
        return labels

    def _ordered_actions(self, state: GameState, preferred: int | None = None) -> list[int]:
        board, n = state.board, state.n
        empty = np.flatnonzero(board == 0).tolist()
        own_labels = self._labels(board, n, state.player)
        other_labels = self._labels(board, n, 3 - state.player)
        self_gain: dict[int, int] = {}
        opponent_gain: dict[int, int] = {}
        for cell in empty:
            neighbors = list(self._neighbors(cell, n))
            own_components = {int(own_labels[x]) for x in neighbors if own_labels[x] >= 0}
            other_components = {int(other_labels[x]) for x in neighbors if other_labels[x] >= 0}
            self_gain[cell] = 1 - len(own_components)
            opponent_gain[cell] = 1 - len(other_components)

        if len(empty) <= 14:
            self_cells = empty
            gift_cells = empty
        else:
            limit = 6 if n == 7 else 8
            self_cells = sorted(empty, key=lambda cell: (-self_gain[cell], cell))[:limit]
            gift_cells = sorted(empty, key=lambda cell: (opponent_gain[cell], cell))[:limit]
            best_self = max(empty, key=lambda cell: (self_gain[cell], -cell))
            best_gift = min((cell for cell in empty if cell != best_self),
                            key=lambda cell: (opponent_gain[cell], cell))
            if best_self not in self_cells:
                self_cells[-1] = best_self
            if best_gift not in gift_cells:
                gift_cells[-1] = best_gift

        actions = [encode_action(x, y, n) for x in self_cells for y in gift_cells if x != y]
        actions.sort(key=lambda action: (
            -(self_gain[action // (n * n)] - opponent_gain[action % (n * n)]), action,
        ))
        if preferred is not None and preferred in actions:
            actions.remove(preferred)
            actions.insert(0, preferred)
        return actions

    def _evaluate(self, state: GameState) -> float:
        if state.terminal:
            return float(state.value())
        own, other = state.scores()
        if state.player == 2:
            own, other = other, own
        return float(own - other)

    def _negamax(self, state: GameState, depth: int, alpha: float, beta: float) -> float:
        if self.nodes >= self.node_budget or time.perf_counter() >= self.deadline:
            raise _SearchTimeout
        self.nodes += 1
        if state.terminal or depth == 0:
            return self._evaluate(state)

        key = (state.board.tobytes(), state.player, depth)
        original_alpha, original_beta = alpha, beta
        cached = self.table.get(key)
        if cached is not None:
            if cached.bound == "exact":
                return cached.value
            if cached.bound == "lower":
                alpha = max(alpha, cached.value)
            else:
                beta = min(beta, cached.value)
            if alpha >= beta:
                return cached.value

        best = -math.inf
        best_action = None
        for action in self._ordered_actions(state, cached.best_action if cached else None):
            value = -self._negamax(state.play(action), depth - 1, -beta, -alpha)
            if value > best:
                best = value
                best_action = action
            alpha = max(alpha, value)
            if alpha >= beta:
                break

        bound = "exact"
        if best <= original_alpha:
            bound = "upper"
        elif best >= original_beta:
            bound = "lower"
        self.table[key] = _TTEntry(best, bound, best_action)
        return best

    def run(self) -> ClassicResult:
        actions = self._ordered_actions(self.root)
        if not actions:
            raise ValueError("no legal actions")
        tie_order = list(actions)
        self.rng.shuffle(tie_order)
        tie_rank = {action: rank for rank, action in enumerate(tie_order)}
        best_action = min(actions, key=lambda action: tie_rank[action])
        best_value = -self._evaluate(self.root.play(best_action))

        for depth in (1, 2):
            try:
                iteration_best = -math.inf
                iteration_action = best_action
                ordered = [best_action] + [action for action in actions if action != best_action]
                alpha = -math.inf
                for action in ordered:
                    value = -self._negamax(self.root.play(action), depth - 1, -math.inf, -alpha)
                    if (value > iteration_best or
                            (value == iteration_best and tie_rank[action] < tie_rank[iteration_action])):
                        iteration_best, iteration_action = value, action
                    alpha = max(alpha, value)
                best_action, best_value = iteration_action, iteration_best
                self.completed_depth = depth
            except _SearchTimeout:
                break

        empties = int(np.count_nonzero(self.root.board == 0))
        proven = empties <= 5 and self.completed_depth >= max(1, (empties - 1) // 2)
        signed_value = float(np.sign(best_value)) if proven and abs(best_value) >= 1 else float(
            0.95 * math.tanh(best_value / 4.0)
        )
        return ClassicResult(best_action, self.nodes, self.seed, signed_value,
                             self.completed_depth or None)


def choose_move(state: GameState, time_ms: int = 1500, seed: int = 0,
                nodes: int = 2500) -> ClassicResult:
    return ClassicSearcher(state, nodes=nodes, time_ms=time_ms, seed=seed).run()

