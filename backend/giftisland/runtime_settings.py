"""Validation and recovery for the small, shared runtime control file.

``runtime.json`` is written by the supervisor and read by actors and the
learner.  It is intentionally a flat dictionary: workers may add metadata
which another worker does not understand, while every known control is
validated before it can affect a process restart.
"""

from __future__ import annotations

import json
import math
from numbers import Integral, Real
from pathlib import Path
from typing import Any


# The native search stores child visit counts in uint16 arrays.  Keep this
# limit explicit so a parseable runtime override cannot wrap on shard output.
MAX_SEARCH_VISITS = 2**16 - 1

_POSITIVE_INTS = {
    "concurrent_games": 1_000_000,
    "threads": 1_024,
    "batch_size": 65_535,
    "min_positions": 10_000_000_000,
    "replay_capacity_positions": 10_000_000_000,
    "checkpoint_every_updates": 10_000_000,
}
_NONNEGATIVE_INTS = {
    "temperature_moves": MAX_SEARCH_VISITS,
    "screen_games": 1_000_000,
    "games": 1_000_000,
    "holdout_games": 1_000_000,
}

# These bounds are deliberately broad.  They reject malformed controls while
# leaving the supervisor room to run documented experiments.
_POSITIVE_REALS = {
    "cpuct": 1_000_000.0,
    "noise_alpha": 1_000_000.0,
    "root_temperature": 1_000_000.0,
    "learning_rate": 10.0,
    "gradient_clip": 1_000_000.0,
    "samples_per_new_position": 1_000_000.0,
    "heartbeat_seconds": 1_000_000.0,
}
_NONNEGATIVE_REALS = {
    "temperature_late": 1_000_000.0,
    "score_weight": 1_000_000.0,
    "weight_decay": 10.0,
}
_UNIT_INTERVAL = {"noise_fraction", "random_opening_probability"}

_PRECISIONS = {"fp32", "fp16", "bf16"}
# ``none`` is the public inference spelling for the identity transform;
# accept both spellings in the shared runtime file.
_SYMMETRIES = {"none", "identity", "random", "ensemble"}


def _is_int(value: Any, minimum: int, maximum: int) -> bool:
    return isinstance(value, Integral) and not isinstance(value, (bool,)) and minimum <= value <= maximum


def _is_real(value: Any, minimum: float, maximum: float) -> bool:
    return (isinstance(value, Real) and not isinstance(value, (bool,))
            and math.isfinite(float(value)) and minimum <= float(value) <= maximum)


def _json_finite(value: Any) -> bool:
    """Ensure unknown metadata remains ordinary JSON, including finite numbers."""

    try:
        json.dumps(value, allow_nan=False)
    except (TypeError, ValueError, OverflowError):
        return False
    return True


def validate_runtime(value: Any) -> bool:
    """Return whether a runtime control dictionary is safe to consume.

    Unknown keys are accepted when they are ordinary finite JSON values.  The
    supervisor uses those keys for experiment metadata and workers must retain
    them when merging the file with their own defaults.
    """

    if not isinstance(value, dict) or not _json_finite(value):
        return False
    for key, item in value.items():
        if key == "simulations":
            if not _is_int(item, 1, MAX_SEARCH_VISITS):
                return False
        elif key in _POSITIVE_INTS:
            if not _is_int(item, 1, _POSITIVE_INTS[key]):
                return False
        elif key in _NONNEGATIVE_INTS:
            if not _is_int(item, 0, _NONNEGATIVE_INTS[key]):
                return False
        elif key == "exact_endgame":
            if not _is_int(item, 0, 9):
                return False
        elif key == "gpu_id":
            if not _is_int(item, 0, 255):
                return False
        elif key == "board_size":
            if not _is_int(item, 1, 99) or item % 2 == 0:
                return False
        elif key == "gpu_ids":
            if (not isinstance(item, list) or not item
                    or any(not _is_int(gpu, 0, 255) for gpu in item)
                    or len(set(item)) != len(item)):
                return False
        elif key in _POSITIVE_REALS:
            if not _is_real(item, 0.0, _POSITIVE_REALS[key]) or float(item) == 0.0:
                return False
        elif key in _NONNEGATIVE_REALS:
            if not _is_real(item, 0.0, _NONNEGATIVE_REALS[key]):
                return False
        elif key in _UNIT_INTERVAL:
            if not _is_real(item, 0.0, 1.0):
                return False
        elif key in {"fpu_reduction"}:
            if not _is_real(item, 0.0, 1.0):
                return False
        elif key == "root_fpu_reduction":
            if not _is_real(item, -1.0, 1.0) or (float(item) < 0.0 and float(item) != -1.0):
                return False
        elif key == "precision":
            if not isinstance(item, str) or item not in _PRECISIONS:
                return False
        elif key == "symmetry":
            if not isinstance(item, str) or item not in _SYMMETRIES:
                return False
        elif key == "pad_batches":
            if not isinstance(item, bool):
                return False
    return True


def _fingerprint(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


_CACHE: dict[Path, tuple[str, dict[str, Any]]] = {}


def _candidate(path: Path) -> tuple[str, dict[str, Any] | None]:
    """Classify a candidate without moving bytes; ``dict_json`` does recovery."""

    try:
        value = json.loads(path.read_text())
    except FileNotFoundError:
        return "missing", None
    except (OSError, TypeError, ValueError):
        return "invalid", None
    if validate_runtime(value):
        return "valid", value
    return "invalid", None


def load_runtime(run: str | Path, *, log_path: str | Path | None = None) -> dict[str, Any]:
    """Read, validate, and safely recover ``runtime.json`` for a run.

    ``dict_json`` quarantines malformed primary/backup bytes and atomically
    restores a valid backup.  A valid backup is refreshed only when the valid
    runtime content changes, so workers polling this file do not issue a
    durable write on every training iteration.
    """

    run = Path(run)
    path = run / "runtime.json"
    backup = run / "runtime.previous.json"
    if log_path is None:
        log_path = run / "logs" / "runtime.jsonl"
    from .resilience import dict_json
    primary_state, primary_value = _candidate(path)
    backup_state, backup_value = _candidate(backup)
    runtime = dict_json(path, default={}, backup=backup, log_path=log_path, validate=validate_runtime)

    # A valid primary is authoritative, including an explicit ``{}`` reset.
    # That reset must replace the previous backup with an empty dictionary.
    if primary_state == "valid":
        fingerprint = _fingerprint(runtime)
        if backup_state != "valid" or _fingerprint(backup_value) != fingerprint:
            # Let dict_json quarantine an invalid backup before replacing it.
            if backup_state != "valid":
                dict_json(backup, default={}, log_path=log_path, validate=validate_runtime)
            from .common import atomic_json
            atomic_json(backup, runtime)
        _CACHE[path] = (fingerprint, dict(runtime))
        return runtime

    # If the primary is absent/invalid, dict_json has either restored a valid
    # backup or returned its default.  A valid backup remains authoritative and
    # must not be rewritten merely because the primary was bad.
    if backup_state == "valid":
        _CACHE[path] = (_fingerprint(runtime), dict(runtime))
        return runtime

    # Both on-disk candidates failed.  A worker may still have a known-good
    # value from an earlier poll; restore that value rather than replacing it
    # with dict_json's empty fallback.  With no cache, leave the quarantined
    # files absent so a fallback cannot manufacture an empty backup.
    cached = _CACHE.get(path)
    if cached is not None:
        _, saved = cached
        from .common import atomic_json
        atomic_json(path, saved)
        atomic_json(backup, saved)
        return dict(saved)
    return runtime
