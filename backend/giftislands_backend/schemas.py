from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt


Cell = Annotated[StrictInt, Field(ge=0, le=2)]
Player = Annotated[StrictInt, Field(ge=1, le=2)]
Coordinate = Annotated[StrictInt, Field(ge=0, le=10)]
Point = Annotated[list[Coordinate], Field(min_length=2, max_length=2)]
Level = Literal["level1", "level2", "level3", "best", "classic"]
Symmetry = Literal["none", "random", "ensemble"]


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PositionRequest(Request):
    board: list[Cell] = Field(default_factory=lambda: [0] * 81, min_length=49, max_length=121,
                              description="7×7、9×9或11×11棋盘按行展开；0空、1黑、2白。")
    player: Player | None = Field(default=None, description="当前行动者；省略时根据已完成手数推导。黑先。")


class PlayMoveRequest(PositionRequest):
    self_point: Point = Field(description="[row, col]，给当前玩家落子，坐标从0开始。")
    opponent_point: Point = Field(description="[row, col]，给对方落子；必须是另一个空格。")


class AIMoveRequest(PositionRequest):
    level: Level | None = None
    simulations: Annotated[StrictInt, Field(ge=1, le=2048)] | None = None
    symmetry: Symmetry | None = None
    seed: Annotated[StrictInt, Field(ge=0, le=2**63 - 1)] | None = None


class Scores(BaseModel):
    black: int
    white: int


class PositionResponse(BaseModel):
    board: list[int]
    board_size: int
    player: int
    move_number: int
    empty_count: int
    terminal: bool
    scores: Scores
    result: Literal["ongoing", "black_win", "white_win", "draw"]
    position_key: str


class Move(BaseModel):
    player: int
    action_index: int
    self_point: tuple[int, int]
    opponent_point: tuple[int, int]


class PlayMoveResponse(BaseModel):
    requested_position_key: str
    move: Move
    position: PositionResponse


class ModelSummary(BaseModel):
    level: Level
    label: str
    step: int
    sha256: str


class SearchSummary(BaseModel):
    simulations: int
    symmetry: Symmetry
    seed: int
    signed_value: float = Field(description="当前行动者视角的胜概率减负概率，范围[-1,1]；不是胜率。")
    elapsed_ms: float
    exact_endgame: int
    depth: int | None = None


class AIMoveResponse(PlayMoveResponse):
    model: ModelSummary
    search: SearchSummary
