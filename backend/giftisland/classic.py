"""Deterministic, bounded classical search for Gift Islands."""

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
    def __init__(self, state: GameState, time_ms: int, seed: int):
        self.root = state
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
    def _component_labels(cls, board: np.ndarray, n: int, color: int) -> tuple[np.ndarray, int]:
        labels = np.full(n * n, -1, dtype=np.int16)
        count = 0
        for cell in range(n * n):
            if board[cell] != color or labels[cell] >= 0:
                continue
            stack = [cell]
            labels[cell] = count
            while stack:
                current = stack.pop()
                for neighbor in cls._neighbors(current, n):
                    if board[neighbor] == color and labels[neighbor] < 0:
                        labels[neighbor] = count
                        stack.append(neighbor)
            count += 1
        return labels, count

    @classmethod
    def _cell_priority(
        cls, state: GameState, cell: int, color: int, other: int, own_move: bool,
        other_labels: np.ndarray,
    ) -> float:
        board, n = state.board, state.n
        adjacent_own = [x for x in cls._neighbors(cell, n) if board[x] == color]
        adjacent_other = [x for x in cls._neighbors(cell, n) if board[x] == other]
        opposite_components = len({int(other_labels[x]) for x in adjacent_other if other_labels[x] >= 0})
        score = 0.0
        if own_move:
            score += 4.0 if not adjacent_own else -2.0 * len(adjacent_own)
            score += 0.7 * len(adjacent_other)
        else:
            score += 5.0 * len(adjacent_other)
            score += 3.5 * max(0, opposite_components - 1)
            score -= 2.0 if not adjacent_other else 0.0
            score -= 0.5 * len(adjacent_own)
        score += float((cell * 2654435761) & 0xFFFF) / 65536.0 * 1e-3
        return score

    def _candidate_roles(self, state: GameState) -> tuple[list[int], list[int]]:
        empty = np.flatnonzero(state.board == 0).tolist()
        if len(empty) <= 14:
            return empty, empty
        color, other = state.player, 3 - state.player
        other_labels, _ = self._component_labels(state.board, state.n, other)
        own = sorted(
            empty,
            key=lambda c: self._cell_priority(state, c, color, other, True, other_labels),
            reverse=True,
        )
        gift = sorted(
            empty,
            key=lambda c: self._cell_priority(state, c, color, other, False, other_labels),
            reverse=True,
        )
        # Keep two role-specific beams, while allowing either role to use any cell.
        limit = 8 if state.n == 7 else 10
        return own[:limit], gift[:limit]

    def _actions(self, state: GameState, preferred: int | None = None) -> list[int]:
        ranked_self, ranked_gift = self._candidate_roles(state)
        actions = [encode_action(x, y, state.n) for x in ranked_self for y in ranked_gift if x != y]
        if preferred is not None and preferred in actions:
            actions.remove(preferred)
            actions.insert(0, preferred)
        return actions

    def _evaluate(self, state: GameState) -> float:
        if state.terminal:
            return float(state.value())
        own, opponent = state.scores()
        if state.player == 2:
            own, opponent = opponent, own
        own_potential = opponent_potential = 0
        for cell in np.flatnonzero(state.board == 0):
            neighbors = list(self._neighbors(int(cell), state.n))
            if not any(state.board[x] == state.player for x in neighbors):
                own_potential += 1
            if not any(state.board[x] == 3 - state.player for x in neighbors):
                opponent_potential += 1
        raw = 1.6 * (own - opponent) + 0.025 * (own_potential - opponent_potential)
        return float(0.95 * math.tanh(raw))

    def _negamax(self, state: GameState, depth: int, alpha: float, beta: float) -> float:
        if time.perf_counter() >= self.deadline:
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
        best = -2.0
        best_action = None
        for action in self._actions(state, cached.best_action if cached else None):
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
        actions = self._actions(self.root)
        if not actions:
            raise ValueError("no legal actions")
        # Search order stays deterministic. The seed only chooses among equal-valued moves.
        tie_order = list(actions)
        self.rng.shuffle(tie_order)
        tie_rank = {int(action): rank for rank, action in enumerate(tie_order)}
        best_action = min(actions, key=lambda action: tie_rank[action])
        best_value = self._evaluate(self.root.play(best_action))
        max_depth = 1
        empties = int(np.count_nonzero(self.root.board == 0))
        if empties <= 8:
            max_depth = empties // 2 + 1
        else:
            max_depth = 8 if self.root.n == 7 else 6
        for depth in range(1, max_depth + 1):
            try:
                iteration_best = -2.0
                iteration_action = best_action
                ordered = [best_action] + [action for action in actions if action != best_action]
                alpha = -2.0
                for action in ordered:
                    value = -self._negamax(self.root.play(action), depth - 1, -2.0, -alpha)
                    if (value > iteration_best + 1e-12 or
                            (abs(value - iteration_best) <= 1e-12 and
                             tie_rank[action] < tie_rank[iteration_action])):
                        iteration_best, iteration_action = value, int(action)
                    alpha = max(alpha, value)
                best_action, best_value = iteration_action, iteration_best
                self.completed_depth = depth
            except _SearchTimeout:
                break
        return ClassicResult(best_action, self.nodes, self.seed, float(np.clip(best_value, -1, 1)),
                             self.completed_depth or None)


def choose_move(state: GameState, time_ms: int = 1500, seed: int = 0) -> ClassicResult:
    return ClassicSearcher(state, time_ms, seed).run()

