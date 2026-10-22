import asyncio
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import __version__
from .config import Settings
from .positions import PositionError, apply_points, checked_position, describe_move, position_response
from .schemas import AIMoveRequest, AIMoveResponse, PlayMoveRequest, PlayMoveResponse, PositionRequest, PositionResponse


logger = logging.getLogger("giftislands")


def create_app(settings=None, engine_factory=None):
    settings = settings or Settings.from_env()
    settings.validate()

    @asynccontextmanager
    async def lifespan(app):
        if engine_factory is None:
            from .engine import InferenceEngine
            factory = InferenceEngine
        else:
            factory = engine_factory
        app.state.engine = await asyncio.to_thread(factory, settings)
        try:
            yield
        finally:
            await asyncio.to_thread(app.state.engine.close)

    app = FastAPI(
        title="Gift Islands 9×9 Engine API", version=__version__, lifespan=lifespan,
        description="赠岛四级AI后端。棋盘按行展开为81格：0空、1黑、2白。每手同时为自己和对方各落一子；连通块多者胜。接口无会话状态，前端保管棋盘。",
    )
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_origin_regex=settings.cors_origin_regex, allow_credentials=False,
                       allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Accept"])

    @app.exception_handler(PositionError)
    async def position_error(request: Request, exc: PositionError):
        return JSONResponse(status_code=422, content={"detail": {"code": "invalid_position", "message": str(exc)}})

    @app.get("/", include_in_schema=False)
    async def index():
        return RedirectResponse("/docs")

    @app.get("/healthz", tags=["System"])
    @app.get("/api/v1/health", tags=["System"])
    async def health(request: Request):
        engine = request.app.state.engine
        return {"status": "ok", "ready": True, "version": __version__, "device": "cpu",
                "busy": engine.busy, "model_count": len(engine.model_summaries())}

    @app.get("/api/v1/models", tags=["Models"])
    async def models(request: Request):
        engine = request.app.state.engine
        return {"models": engine.model_summaries(), "default_level": "best",
                "default_simulations": settings.default_simulations, "max_simulations": settings.max_simulations,
                "default_symmetry": settings.default_symmetry, "verification": engine.catalog["verification"]}

    @app.get("/api/v1/rules", tags=["Game"])
    async def rules():
        return {"board_size": 9, "board_encoding": {"empty": 0, "black": 1, "white": 2},
                "coordinates": "zero-based [row, column]", "first_player": 1, "moves_per_game": 40,
                "placement": "self_point receives player; opponent_point receives 3-player; both points must be distinct and empty",
                "connections": "orthogonal only", "scoring": "one point per same-color connected component; larger score wins",
                "terminal_empty_cells": 1, "state_management": "stateless; client submits the entire position"}

    @app.post("/api/v1/positions/validate", response_model=PositionResponse, tags=["Game"])
    async def validate_position(body: PositionRequest):
        return position_response(checked_position(body.board, body.player))

    @app.post("/api/v1/play-move", response_model=PlayMoveResponse, tags=["Game"])
    async def play_move(body: PlayMoveRequest):
        state = checked_position(body.board, body.player)
        if state.terminal:
            raise HTTPException(409, detail={"code": "game_finished", "message": "棋局已经结束。"})
        action, next_state = apply_points(state, body.self_point, body.opponent_point)
        return {"requested_position_key": position_response(state)["position_key"],
                "move": describe_move(action, state.player), "position": position_response(next_state)}

    @app.post("/api/v1/ai-move", response_model=AIMoveResponse, tags=["AI"],
              responses={409: {"description": "Game already finished"}, 422: {"description": "Invalid position or settings"},
                         503: {"description": "Engine busy; retry later"}, 504: {"description": "Inference time limit exceeded"}})
    async def ai_move(body: AIMoveRequest, request: Request):
        state = checked_position(body.board, body.player)
        if state.terminal:
            raise HTTPException(409, detail={"code": "game_finished", "message": "棋局已经结束。"})
        simulations = body.simulations if body.simulations is not None else settings.default_simulations
        symmetry = body.symmetry if body.symmetry is not None else settings.default_symmetry
        if simulations > settings.max_simulations:
            raise HTTPException(422, detail={"code": "search_budget_exceeded", "message": f"simulations最大为{settings.max_simulations}。"})
        from .engine import EngineBusy
        try:
            future = request.app.state.engine.submit(state, body.level, simulations, symmetry, body.seed)
        except EngineBusy as exc:
            raise HTTPException(503, detail={"code": "engine_busy", "message": str(exc)}, headers={"Retry-After": "1"}) from exc
        try:
            # Shield the real job: a timed-out/disconnected HTTP request must not
            # free its slot while the native/PyTorch calculation is still running.
            wrapped = asyncio.wrap_future(future)
            return await asyncio.wait_for(asyncio.shield(wrapped), timeout=settings.request_timeout)
        except TimeoutError as exc:
            raise HTTPException(504, detail={"code": "inference_timeout", "message": "计算超过等待时间；引擎完成当前任务后可重试。"}) from exc
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Inference failed for level=%s", body.level)
            raise HTTPException(500, detail={"code": "inference_failed", "message": "推理失败，请查看后端日志。"}) from exc

    return app


app = create_app()
