"""Reference rules implementation for the 9x9 Gift Island game.

The production self-play/search code uses a faster representation, but this
module deliberately keeps the rules small and unsurprising.  A ``GameState``
owns an immutable, absolute board (0 empty, 1 black, 2 white), and all
coordinate/action conversions use a stable row-major indexing scheme:

``cell = row * n + column`` and ``action = n*n*x + y``.

The implementation is useful both as an executable specification and as a
test oracle for the native engine.  It does not depend on the native engine or
on PyTorch.
"""

from __future__ import annotations

from functools import lru_cache
import operator
from typing import Any, Iterable

import numpy as np


__all__ = [
    "GameState",
    "action_points",
    "encode_action",
    "symmetry_maps",
    "transform_board",
    "transform_action",
    "count_components",
    "minimax_cached",
]


def _as_index(value: Any, name: str) -> int:
    """Return an integer accepted by Python's index protocol.

    In particular, accepting ``np.int32`` actions is useful at the boundary
    with policy arrays, while accepting floating point values would hide
    malformed actions (``int(1.5)`` is not a valid conversion here).
    """

    if isinstance(value, (bool, np.bool_)):
        raise ValueError(f"{name} must be an integer")
    try:
        result = operator.index(value)
    except TypeError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    return int(result)


def _validate_n(n: Any) -> int:
    n = _as_index(n, "n")
    if n <= 0 or n % 2 == 0:
        raise ValueError("n must be a positive odd integer")
    return n


def _infer_n_from_cells(size: int) -> int:
    size = _as_index(size, "board size")
    n = int(np.sqrt(size))
    if n * n != size:
        raise ValueError("board size must be a perfect square")
    return _validate_n(n)


def encode_action(x: Any, y: Any, n: int = 9) -> int:
    """Encode two different flat cell ids as an ordered action id.

    The first cell receives the current player's stone and the second receives
    the other player's stone.  Ordered pairs are intentional: exchanging the
    two cells is a different action.
    """

    n = _validate_n(n)
    x = _as_index(x, "x")
    y = _as_index(y, "y")
    cells = n * n
    if not 0 <= x < cells or not 0 <= y < cells:
        raise ValueError("action points must be valid cell ids")
    if x == y:
        raise ValueError("action points must be distinct")
    return cells * x + y


def action_points(action: Any, n: int = 9) -> tuple[int, int]:
    """Decode an action id into its ordered pair of flat cell ids."""

    n = _validate_n(n)
    action = _as_index(action, "action")
    cells = n * n
    if action < 0 or action >= cells * cells:
        raise ValueError("action id is out of range")
    x, y = divmod(action, cells)
    if x == y:
        raise ValueError("an action must use two distinct cells")
    return x, y


def _validate_mapping(mapping: Any, n: int | None = None) -> tuple[np.ndarray, int]:
    """Normalize a cell permutation or a D4 symmetry index.

    A mapping is always interpreted as ``old_cell -> new_cell``.  Passing an
    integer selects that index from :func:`symmetry_maps`; passing an array
    permits callers to reuse a precomputed mapping.  The latter is especially
    handy for transforming policy/action arrays without recomputing D4 maps.
    """

    if isinstance(mapping, (bool, np.bool_)):
        raise ValueError("symmetry index must be an integer")

    if np.isscalar(mapping):
        if n is None:
            n = 9
        n = _validate_n(n)
        symmetry = _as_index(mapping, "symmetry index")
        if not 0 <= symmetry < 8:
            raise ValueError("symmetry index must be in [0, 8)")
        result = symmetry_maps(n)[symmetry]
        return result, n

    raw = np.asarray(mapping)
    if raw.ndim != 1:
        raise ValueError("symmetry mapping must be a one-dimensional array")
    if n is None:
        n = _infer_n_from_cells(raw.size)
    else:
        n = _validate_n(n)
    cells = n * n
    if raw.size != cells:
        raise ValueError("symmetry mapping has the wrong size")
    if not np.issubdtype(raw.dtype, np.integer):
        raise ValueError("symmetry mapping must contain integers")
    result = np.asarray(raw, dtype=np.int64).copy()
    if np.any(result < 0) or np.any(result >= cells):
        raise ValueError("symmetry mapping contains an out-of-range cell")
    if not np.array_equal(np.sort(result), np.arange(cells, dtype=np.int64)):
        raise ValueError("symmetry mapping must be a permutation")
    result.setflags(write=False)
    return result, n


def symmetry_maps(n: int = 9) -> np.ndarray:
    """Return the eight D4 cell permutations for an ``n`` by ``n`` board.

    The returned array has shape ``(8, n*n)`` and dtype ``int64``.  Entry
    ``maps[k, old]`` is the new flat cell id of ``old`` under symmetry ``k``.
    The order is identity, rotations by 90/180/270 degrees, reflection in
    the vertical axis, reflection in the horizontal axis, reflection in the
    main diagonal, and reflection in the anti-diagonal.
    """

    n = _validate_n(n)
    maps = np.empty((8, n * n), dtype=np.int64)

    # These coordinate maps are all bijections of the square.  Keeping the
    # convention explicit avoids the common inverse-permutation bug when a
    # board and its policy/action ids are transformed together.
    transforms = (
        lambda r, c: (r, c),
        lambda r, c: (c, n - 1 - r),
        lambda r, c: (n - 1 - r, n - 1 - c),
        lambda r, c: (n - 1 - c, r),
        lambda r, c: (r, n - 1 - c),
        lambda r, c: (n - 1 - r, c),
        lambda r, c: (c, r),
        lambda r, c: (n - 1 - c, n - 1 - r),
    )
    for old in range(n * n):
        row, col = divmod(old, n)
        for k, transform in enumerate(transforms):
            new_row, new_col = transform(row, col)
            maps[k, old] = new_row * n + new_col
    maps.setflags(write=False)
    return maps


def transform_board(
    board: Iterable[int] | np.ndarray,
    mapping: Any,
    n: int | None = None,
) -> np.ndarray:
    """Apply a D4/cell permutation to a board.

    ``mapping`` can be a row in :func:`symmetry_maps` or a symmetry index.
    The board may be flat or ``(n, n)``; its shape is preserved in the return
    value.  Values are copied without interpreting colors, which also makes
    this helper useful for arbitrary policy planes and test fixtures.
    """

    raw = np.asarray(board)
    was_matrix = raw.ndim == 2
    if was_matrix:
        if raw.shape[0] != raw.shape[1]:
            raise ValueError("board must be square")
        if n is None:
            n = _validate_n(raw.shape[0])
        elif _validate_n(n) != raw.shape[0]:
            raise ValueError("board shape and n disagree")
        flat = raw.reshape(-1)
    elif raw.ndim == 1:
        flat = raw
        if n is None:
            n = _infer_n_from_cells(flat.size)
    else:
        raise ValueError("board must be flat or square")

    permutation, n = _validate_mapping(mapping, n)
    if flat.size != n * n:
        raise ValueError("board has the wrong size")
    transformed = np.empty_like(flat)
    transformed[permutation] = flat
    if was_matrix:
        return transformed.reshape(n, n)
    return transformed


def transform_action(action: Any, mapping: Any, n: int = 9) -> int:
    """Transform both endpoints of an ordered action by a cell permutation."""

    # An explicit mapping carries its board size.  This convenience allows
    # ``transform_action(a, symmetry_maps(3)[k], n=None)`` while preserving
    # the documented 9x9 default for symmetry indices.
    if not np.isscalar(mapping) and n == 9:
        raw_mapping = np.asarray(mapping)
        if raw_mapping.ndim == 1 and raw_mapping.size != 9 * 9:
            n = _infer_n_from_cells(raw_mapping.size)
    permutation, n = _validate_mapping(mapping, n)
    x, y = action_points(action, n)
    return encode_action(int(permutation[x]), int(permutation[y]), n)


def count_components(board: Iterable[int] | np.ndarray, n: int, color: int) -> int:
    """Count 4-neighbor connected components of ``color`` on an arbitrary board.

    Unlike :class:`GameState`, this low-level helper intentionally accepts
    unbalanced boards.  It is used by exhaustive rule tests and by callers
    that need to inspect a hypothetical board before constructing a state.
    The union-find implementation is independent of the state's reachability
    and turn validation.
    """

    n = _validate_n(n)
    color = _as_index(color, "color")
    if color not in (1, 2):
        raise ValueError("color must be 1 (black) or 2 (white)")
    raw = np.asarray(board)
    if raw.ndim == 2:
        if raw.shape != (n, n):
            raise ValueError("board shape and n disagree")
        flat = raw.reshape(-1)
    elif raw.ndim == 1 and raw.size == n * n:
        flat = raw
    else:
        raise ValueError("board has the wrong shape")
    # Keep the helper usable with regular integer lists, but reject malformed
    # colors instead of silently treating them as empty.
    if np.any(~np.isin(flat, (0, 1, 2))):
        raise ValueError("board contains a value other than 0, 1, or 2")
    occupied = np.asarray(flat == color, dtype=bool)
    parent = np.arange(n * n, dtype=np.int32)
    rank = np.zeros(n * n, dtype=np.int8)

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = int(parent[node])
        return node

    def union(a: int, b: int) -> None:
        root_a = find(a)
        root_b = find(b)
        if root_a == root_b:
            return
        if rank[root_a] < rank[root_b]:
            root_a, root_b = root_b, root_a
        parent[root_b] = root_a
        if rank[root_a] == rank[root_b]:
            rank[root_a] += 1

    for row in range(n):
        for col in range(n):
            cell = row * n + col
            if not occupied[cell]:
                continue
            if col and occupied[cell - 1]:
                union(cell, cell - 1)
            if row and occupied[cell - n]:
                union(cell, cell - n)
    roots = {find(int(cell)) for cell in np.flatnonzero(occupied)}
    return len(roots)


class GameState:
    """An immutable reachable game state.

    ``board`` is stored as a read-only ``np.int8`` flat array.  Since every
    move adds exactly one black and one white stone, a valid state always has
    equal black and white counts.  The current player is consequently fixed
    by the number of completed pair moves: black to play for an even number,
    white to play for an odd number.
    """

    __slots__ = ("n", "board", "player")

    def __init__(
        self,
        n: int = 9,
        board: Iterable[int] | np.ndarray | None = None,
        player: int = 1,
    ) -> None:
        n = _validate_n(n)
        player = _as_index(player, "player")
        if player not in (1, 2):
            raise ValueError("player must be 1 (black) or 2 (white)")

        if board is None:
            array = np.zeros(n * n, dtype=np.int8)
        else:
            raw = np.asarray(board)
            if raw.ndim == 2:
                if raw.shape != (n, n):
                    raise ValueError("board shape and n disagree")
                raw = raw.reshape(-1)
            elif raw.ndim != 1 or raw.size != n * n:
                raise ValueError("board must have shape (n*n,) or (n,n)")
            if np.any(~np.isin(raw, (0, 1, 2))):
                raise ValueError("board contains a value other than 0, 1, or 2")
            # The conversion happens only after validating exact color values,
            # so e.g. 1.5 cannot be silently truncated to 1.
            array = np.asarray(raw, dtype=np.int8).copy()

        black = int(np.count_nonzero(array == 1))
        white = int(np.count_nonzero(array == 2))
        if black != white:
            raise ValueError("reachable states must have equal black and white counts")
        completed_pairs = black
        expected_player = 1 if completed_pairs % 2 == 0 else 2
        if player != expected_player:
            raise ValueError(
                f"player {player} is inconsistent with {completed_pairs} completed pair moves"
            )

        array.setflags(write=False)
        self.n = n
        self.board = array
        self.player = player

    @property
    def terminal(self) -> bool:
        """Whether fewer than two empty cells remain."""

        return int(np.count_nonzero(self.board == 0)) < 2

    def legal_actions(self) -> np.ndarray:
        """Return all legal ordered pairs as sorted ``np.int32`` action ids."""

        empty = np.flatnonzero(self.board == 0).astype(np.int64, copy=False)
        if empty.size < 2:
            return np.empty(0, dtype=np.int32)
        cells = self.n * self.n
        actions = cells * empty[:, None] + empty[None, :]
        actions = actions[~np.eye(empty.size, dtype=bool)].astype(np.int32, copy=False)
        # Empty cell ids are sorted, so row-major construction already gives a
        # sorted action array.  The explicit sort documents and enforces this
        # API property if the construction changes later.
        actions.sort()
        return actions

    def play(self, action: Any) -> "GameState":
        """Play one legal ordered action, returning a new state."""

        if self.terminal:
            raise ValueError("cannot play from a terminal state")
        x, y = action_points(action, self.n)
        if self.board[x] != 0 or self.board[y] != 0:
            raise ValueError("both action points must be empty")
        next_board = self.board.copy()
        next_board[x] = self.player
        next_board[y] = 3 - self.player
        return GameState(n=self.n, board=next_board, player=3 - self.player)

    def scores(self) -> tuple[int, int]:
        """Return ``(black_components, white_components)``."""

        return (
            count_components(self.board, self.n, 1),
            count_components(self.board, self.n, 2),
        )

    def outcome(self) -> int:
        """Return terminal black-perspective outcome in ``{-1, 0, 1}``."""

        if not self.terminal:
            raise ValueError("outcome is defined only for terminal states")
        black, white = self.scores()
        return int(np.sign(black - white))

    def value(self) -> int:
        """Return terminal outcome from the current player's perspective."""

        result = self.outcome()
        return result if self.player == 1 else -result

    def features(self) -> np.ndarray:
        """Return current-player, opponent, and empty planes as float32."""

        current = (self.board == self.player).reshape(self.n, self.n)
        other = (self.board == 3 - self.player).reshape(self.n, self.n)
        empty = (self.board == 0).reshape(self.n, self.n)
        return np.stack((current, other, empty), axis=0).astype(np.float32, copy=False)

    def greedy_action(self, rng: Any | None = None) -> int:
        """Choose a uniformly random tie among immediate component-gain maxima.

        The score for an action is the change in the current player's number
        of components minus the change in the opponent's number of components.
        This is deliberately myopic and exists as a deterministic baseline for
        self-play/search checks, not as a replacement for MCTS.
        """

        actions = self.legal_actions()
        if actions.size == 0:
            raise ValueError("no legal actions")
        own_before, other_before = self.scores()
        if self.player == 2:
            own_before, other_before = other_before, own_before

        scores = np.empty(actions.size, dtype=np.int32)
        for index, action in enumerate(actions):
            child = self.play(int(action))
            child_black, child_white = child.scores()
            own_after, other_after = (
                (child_black, child_white)
                if self.player == 1
                else (child_white, child_black)
            )
            scores[index] = (own_after - own_before) - (other_after - other_before)
        best = np.flatnonzero(scores == scores.max())

        if rng is None:
            rng = np.random.default_rng()
        if hasattr(rng, "choice"):
            # numpy Generator/RandomState and Python's random.Random all expose
            # choice, though the accepted argument types differ slightly.
            try:
                return int(rng.choice(actions[best]))
            except (TypeError, ValueError):
                pass
        if hasattr(rng, "integers"):
            return int(actions[best[int(rng.integers(best.size))]])
        if hasattr(rng, "randint"):
            try:
                offset = int(rng.randint(best.size))
            except TypeError:
                offset = int(rng.randint(0, best.size - 1))
            return int(actions[best[offset]])
        raise TypeError("rng must provide choice, integers, or randint")

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, GameState):
            return NotImplemented
        return self.n == other.n and self.player == other.player and np.array_equal(
            self.board, other.board
        )

    def __repr__(self) -> str:
        return f"GameState(n={self.n}, board={self.board.tolist()}, player={self.player})"


@lru_cache(maxsize=None)
def _minimax_key(n: int, board_bytes: bytes, player: int) -> int:
    """Solve a state from the side-to-move's perspective.

    The cache key is raw board bytes rather than a ``GameState`` so callers
    cannot mutate a state behind the cache's back.  This solver is intended
    for small-board rule tests (especially 3x3), not production 9x9 search.
    """

    board = np.frombuffer(board_bytes, dtype=np.int8).copy()
    state = GameState(n=n, board=board, player=player)
    if state.terminal:
        return state.value()
    # Child values are from the next player's perspective, hence negation.
    return max(-_minimax_key(n, state.play(int(action)).board.tobytes(), 3 - player)
               for action in state.legal_actions())


def minimax_cached(state: GameState) -> int:
    """Return the exact terminal value of ``state`` from its current player."""

    if not isinstance(state, GameState):
        raise TypeError("state must be a GameState")
    return int(_minimax_key(state.n, state.board.tobytes(), state.player))

