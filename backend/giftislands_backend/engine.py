from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
import secrets
import threading
import time

import numpy as np
import torch

from giftisland.common import load_network
from giftisland.search import Evaluator, search, select_action

from .positions import describe_move, position_response


class EngineBusy(RuntimeError):
    pass


class InferenceEngine:
    """Four CPU models, one inference worker, bounded admission and stable identities."""

    def __init__(self, settings):
        self.settings = settings
        torch.set_num_threads(settings.torch_threads)
        if torch.get_num_interop_threads() != 1:
            torch.set_num_interop_threads(1)
        self.device = torch.device("cpu")
        self.catalog = json.loads((settings.models_dir / "models.json").read_text())
        if self.catalog.get("board_size") != 9:
            raise ValueError("This API supports only 9x9 Gift Islands")
        self.models = {}
        for level in ("level1", "level2", "level3", "best"):
            item = self.catalog["models"][level]
            path = (settings.models_dir / item["file"]).resolve()
            if not path.is_relative_to(settings.models_dir.resolve()):
                raise ValueError("Model path leaves the configured model directory")
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != item["sha256"]:
                raise ValueError(f"Model checksum mismatch: {level}")
            model, checkpoint = load_network(path, self.device)
            if checkpoint["step"] != item["step"] or model.n != 9:
                raise ValueError(f"Model identity mismatch: {level}")
            if any(not bool(torch.isfinite(t).all()) for t in model.state_dict().values() if t.is_floating_point()):
                raise ValueError(f"Model has non-finite parameters: {level}")
            self.models[level] = model
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="giftislands-engine")
        self._slot = threading.BoundedSemaphore(1)
        self._state_lock = threading.Lock()
        self._busy = False
        self._closed = False

    def model_summaries(self):
        return [{"level": level, **{key: item[key] for key in ("label", "step", "sha256")}}
                for level, item in self.catalog["models"].items()]

    @property
    def busy(self):
        with self._state_lock:
            return self._busy

    def submit(self, state, level, simulations, symmetry, seed=None):
        if not self._slot.acquire(blocking=False):
            raise EngineBusy("引擎正在计算，请稍后重试。")
        with self._state_lock:
            if self._closed:
                self._slot.release()
                raise EngineBusy("引擎正在关闭。")
            self._busy = True
        try:
            future = self._pool.submit(self._infer, state, level, simulations, symmetry, seed)
        except BaseException:
            self._done(None)
            raise
        future.add_done_callback(self._done)
        return future

    def _done(self, future):
        with self._state_lock:
            self._busy = False
        self._slot.release()

    def _infer(self, state, level, simulations, symmetry, seed):
        seed = secrets.randbits(63) if seed is None else seed
        evaluator = Evaluator(self.models[level], self.device, seed=seed, symmetry=symmetry,
                              precision="fp32", pad_batches=False)
        started = time.perf_counter()
        result = search(state.board[None], [state.player], evaluator,
                        simulations=simulations, seed=seed, noise_fraction=0,
                        root_temperature=1, threads=self.settings.search_threads,
                        exact_endgame=5)[0]
        if int(result["simulations"]) != simulations or int(np.asarray(result["visits"], dtype=np.int64).sum()) != simulations:
            raise RuntimeError("Native search did not execute the requested search budget")
        if not math.isfinite(float(result["value"])) or not -1.00001 <= float(result["value"]) <= 1.00001:
            raise RuntimeError("Native search returned an invalid value")
        action = select_action(result, np.random.default_rng(seed), temperature=0)
        next_state = state.play(action)
        item = self.catalog["models"][level]
        return {
            "requested_position_key": position_response(state)["position_key"],
            "model": {"level": level, **{key: item[key] for key in ("label", "step", "sha256")}},
            "move": describe_move(action, state.player), "position": position_response(next_state),
            "search": {"simulations": int(result["simulations"]), "symmetry": symmetry, "seed": seed,
                       "signed_value": float(result["value"]), "elapsed_ms": round((time.perf_counter()-started)*1000, 3),
                       "exact_endgame": 5},
        }

    def close(self):
        with self._state_lock:
            self._closed = True
        self._pool.shutdown(wait=True, cancel_futures=False)
