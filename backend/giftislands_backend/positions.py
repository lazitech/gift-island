import hashlib

import numpy as np

from giftisland.game import GameState, action_points, encode_action


class PositionError(ValueError):
    pass


def checked_position(board, player=None):
    if len(board) != 81 or any(type(v) is not int or v not in (0, 1, 2) for v in board):
        raise PositionError("棋盘必须是81个整数，且只能取0、1、2。")
    black, white = board.count(1), board.count(2)
    if black != white:
        raise PositionError("每手同时放两色棋子，因此黑白棋子数量必须相同。")
    expected = 1 if black % 2 == 0 else 2
    if player is not None and (type(player) is not int or player != expected):
        raise PositionError(f"当前局面的行动者应为{'黑' if expected == 1 else '白'}方（player={expected}）。")
    return GameState(n=9, board=np.asarray(board, dtype=np.int8), player=expected)


def position_response(state):
    board = state.board.tolist()
    black, white = (int(x) for x in state.scores())
    terminal = bool(state.terminal)
    result = "ongoing"
    if terminal:
        result = "black_win" if black > white else "white_win" if white > black else "draw"
    return {
        "board": board, "player": int(state.player), "move_number": board.count(1),
        "empty_count": board.count(0), "terminal": terminal,
        "scores": {"black": black, "white": white}, "result": result,
        "position_key": hashlib.sha256(bytes(board) + bytes([int(state.player)])).hexdigest(),
    }


def describe_move(action, player):
    x, y = action_points(action, 9)
    return {"player": int(player), "action_index": int(action),
            "self_point": list(divmod(x, 9)), "opponent_point": list(divmod(y, 9))}


def apply_points(state, self_point, opponent_point):
    if state.terminal:
        raise PositionError("棋局已经结束，不能继续落子。")
    for point in (self_point, opponent_point):
        if len(point) != 2 or any(type(v) is not int or not 0 <= v < 9 for v in point):
            raise PositionError("落点必须为[row, col]，且坐标在0到8之间。")
    x, y = (self_point[0] * 9 + self_point[1], opponent_point[0] * 9 + opponent_point[1])
    try:
        action = encode_action(x, y, 9)
        next_state = state.play(action)
    except ValueError as exc:
        raise PositionError("两个落点必须是不同的空格。") from exc
    return action, next_state
