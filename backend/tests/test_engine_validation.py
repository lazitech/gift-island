import hashlib
import json

import pytest

from giftislands_backend.config import Settings
from giftislands_backend.engine import InferenceEngine


def test_model_checksum_is_rejected_before_network_load(tmp_path, monkeypatch):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    model = models_dir / "bad.pt"
    model.write_bytes(b"not-a-checkpoint")
    wrong_checksum = "0" * 64
    catalog = {
        "schema_version": 1,
        "board_size": 9,
        "models": {
            level: {"file": "bad.pt", "step": 1, "sha256": wrong_checksum, "label": level}
            for level in ("level1", "level2", "level3", "best")
        },
        "verification": {"status": "verified"},
    }
    (models_dir / "models.json").write_text(json.dumps(catalog))

    import giftislands_backend.engine as engine_module

    def should_not_load(*args, **kwargs):
        pytest.fail("network loading must not happen before checksum validation")

    monkeypatch.setattr(engine_module, "load_network", should_not_load)
    settings = Settings(models_dir=models_dir, torch_threads=1, search_threads=1)
    with pytest.raises(ValueError, match="checksum mismatch: level1"):
        InferenceEngine(settings)

    assert hashlib.sha256(model.read_bytes()).hexdigest() != wrong_checksum
