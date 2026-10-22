from dataclasses import dataclass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    models_dir: Path = ROOT / "models"
    torch_threads: int = 2
    search_threads: int = 1
    default_simulations: int = 128
    max_simulations: int = 512
    default_symmetry: str = "none"
    request_timeout: float = 120.0
    cors_origins: tuple[str, ...] = ()
    cors_origin_regex: str = r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$"

    @classmethod
    def from_env(cls):
        value = cls(
            models_dir=Path(os.getenv("GIFTISLANDS_MODELS_DIR", str(ROOT / "models"))).expanduser().resolve(),
            torch_threads=int(os.getenv("GIFTISLANDS_TORCH_THREADS", "2")),
            search_threads=int(os.getenv("GIFTISLANDS_SEARCH_THREADS", "1")),
            default_simulations=int(os.getenv("GIFTISLANDS_DEFAULT_SIMULATIONS", "128")),
            max_simulations=int(os.getenv("GIFTISLANDS_MAX_SIMULATIONS", "512")),
            default_symmetry=os.getenv("GIFTISLANDS_SYMMETRY", "none"),
            request_timeout=float(os.getenv("GIFTISLANDS_REQUEST_TIMEOUT", "120")),
            cors_origins=tuple(x.strip() for x in os.getenv("GIFTISLANDS_CORS_ORIGINS", "").split(",") if x.strip()),
            cors_origin_regex=os.getenv("GIFTISLANDS_CORS_ORIGIN_REGEX", cls.cors_origin_regex),
        )
        value.validate()
        return value

    def validate(self):
        if not 1 <= self.torch_threads <= 64 or not 1 <= self.search_threads <= 32:
            raise ValueError("CPU thread counts are outside the supported range")
        if not 1 <= self.default_simulations <= self.max_simulations <= 2048:
            raise ValueError("Require 1 <= default simulations <= maximum simulations <= 2048")
        if self.default_symmetry not in {"none", "random", "ensemble"}:
            raise ValueError("Unsupported symmetry mode")
        if not 1 <= self.request_timeout <= 600:
            raise ValueError("Request timeout must be between 1 and 600 seconds")
