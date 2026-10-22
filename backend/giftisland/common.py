import contextlib
import hashlib
import json
import os
from pathlib import Path
import random
import tempfile
import time

import numpy as np


def config(path):
    with open(path) as f:
        return json.load(f)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_npz(path, **arrays):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            np.savez_compressed(f, **arrays)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_torch(path, value):
    import torch
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        # Some vendor PyTorch builds reject hidden filenames in PyTorchFileWriter.
        # Passing the already-open stream also keeps fsync on the actual writer.
        with os.fdopen(fd, "wb") as f:
            torch.save(value, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def event(log_path, kind, **values):
    log_path = Path(log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = dict(values)
    if "time" in line:
        line["payload_time"] = line["time"]
    line.update(time=time.time(), utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), event=kind)
    with open(log_path, "a") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
        f.flush()
    print(json.dumps(line, ensure_ascii=False), flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def setup_torch(seed, threads=1):
    import torch
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)
    random.seed(seed)
    np.random.seed(seed % 2**32)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.benchmark = True
    return torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


def load_network(path, device):
    import torch
    from .model import GiftNet
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model = GiftNet(**checkpoint["spec"]).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model, checkpoint


def runtime_config(run, original):
    from .runtime_settings import load_runtime
    runtime = load_runtime(run)
    return {**original, **runtime}
