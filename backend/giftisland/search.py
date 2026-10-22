"""Batched C++ PUCT; neural outputs are inverse-mapped after D4 transforms."""
import time
import numpy as np
import torch
from ._search import BatchSearch
from .game import symmetry_maps


class Evaluator:
    def __init__(self, model, device, seed=1, symmetry="random", precision="fp32", pad_batches=False):
        self.model, self.device = model, device
        self.rng = np.random.default_rng(seed)
        self.symmetry, self.precision = symmetry, precision
        self.pad_batches = pad_batches
        self.maps = symmetry_maps(model.n)
        self.inverse = np.argsort(self.maps, axis=1)
        area = model.area
        self.actions = self.maps[:, :, None] * area + self.maps[:, None, :]
        self.actions = self.actions.reshape(8, area * area)
        self.action_tensors = torch.from_numpy(self.actions).to(device)
        self.calls = self.positions = 0
        self.executed_positions = 0
        self.seconds = 0.0
        self.native_request_seconds = self.native_submit_seconds = self.search_seconds = 0.0

    @torch.inference_mode()
    def __call__(self, features):
        start = time.monotonic()
        area = self.model.area
        rows = len(features)
        bucket = max(8, 1 << (rows - 1).bit_length()) if self.pad_batches else rows
        choices = range(8) if self.symmetry == "ensemble" else [None if self.symmetry == "random" else 0]
        policy_sum = value_sum = None
        for s in choices:
            if s is None:
                selected = self.rng.integers(8, size=len(features))
                inverse = self.inverse[selected]
                transformed = features.reshape(-1, 3, area)[np.arange(len(features))[:, None, None],
                    np.arange(3)[None, :, None], inverse[:, None, :]].reshape(features.shape).copy()
            else:
                transformed = features.reshape(-1, 3, area)[:, :, self.inverse[s]].reshape(features.shape).copy()
            if bucket > rows:
                transformed = np.concatenate((transformed, np.repeat(transformed[-1:], bucket - rows, axis=0)))
            x = torch.from_numpy(transformed).to(self.device)
            amp = self.precision != "fp32" and self.device.type == "cuda"
            dtype = torch.bfloat16 if self.precision == "bf16" else torch.float16
            with torch.autocast(device_type=self.device.type, enabled=amp, dtype=dtype):
                policy, wdl, _ = self.model(x)
            policy = policy.float()
            if self.symmetry == "ensemble":
                # Probability averaging is required only for the D4 ensemble.
                from .model import legal_mask
                policy = policy.masked_fill(~legal_mask(x), -1e9).softmax(1)
            policy = policy[:rows]
            indices = self.action_tensors[torch.from_numpy(selected).to(self.device)] if s is None else self.action_tensors[s].expand(rows, -1)
            policy = policy.gather(1, indices)
            wdl = wdl[:rows].float().softmax(1)
            value = wdl[:, 2] - wdl[:, 0]
            # One host transfer instead of two synchronizations and two allocations.
            packed = torch.cat((policy, value[:, None]), dim=1).cpu().numpy()
            policy, value = packed[:, :-1], packed[:, -1]
            policy_sum = policy if policy_sum is None else policy_sum + policy
            value_sum = value if value_sum is None else value_sum + value
        count = len(choices)
        self.calls += count
        self.positions += len(features) * count
        self.executed_positions += bucket * count
        self.seconds += time.monotonic() - start
        if self.symmetry != "ensemble":
            # The C++ core already masks/normalizes all legal logits. Avoid a
            # redundant GPU softmax, CPU logarithm and second C++ softmax.
            return np.ascontiguousarray(policy_sum), np.ascontiguousarray(value_sum)
        return np.log(np.maximum(policy_sum / count, 1e-35)).astype(np.float32), (value_sum / count).astype(np.float32)


def search(boards, players, evaluator, simulations=128, seed=1, cpuct=1.5,
           noise_fraction=0.25, noise_alpha=10.83, fpu_reduction=0.15,
           root_temperature=1.15, threads=4, exact_endgame=0, root_fpu_reduction=-1):
    started = time.monotonic()
    engine = BatchSearch(np.asarray(boards, dtype=np.int8), np.asarray(players, dtype=np.int32),
                         simulations, seed, cpuct, noise_fraction, noise_alpha,
                         fpu_reduction, root_temperature, threads, exact_endgame, root_fpu_reduction)
    while True:
        tick = time.monotonic()
        features = engine.request()
        evaluator.native_request_seconds += time.monotonic() - tick
        if len(features) == 0:
            break
        policy, value = evaluator(features)
        tick = time.monotonic()
        engine.submit(policy, value)
        evaluator.native_submit_seconds += time.monotonic() - tick
    evaluator.search_seconds += time.monotonic() - started
    return engine.results()


def select_action(result, rng, temperature=1.0):
    actions = np.asarray(result["actions"], dtype=np.int32)
    visits = np.asarray(result["visits"], dtype=np.float64)
    if len(actions) == 0 or visits.sum() == 0:
        raise ValueError("search returned no visited legal actions")
    if temperature <= 0:
        tied = actions[visits == visits.max()]
        return int(rng.choice(tied))
    weights = np.exp((np.log(visits) - np.log(visits.max())) / temperature)
    return int(rng.choice(actions, p=weights / weights.sum()))
