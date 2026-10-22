#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${BASE_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip
"${VENV_DIR}/bin/python" -m pip install --requirement "${BASE_DIR}/requirements.txt"

"${VENV_DIR}/bin/python" - <<'PY'
import torch

assert torch.__version__ == "2.14.1+cpu", torch.__version__
assert torch.version.cuda is None, torch.version.cuda
assert torch.version.hip is None, torch.version.hip
assert not torch.cuda.is_available()
probe = torch.arange(16, dtype=torch.float32).reshape(4, 4)
assert float((probe @ probe.T).sum()) == 3680.0
print(f"CPU environment ready: torch {torch.__version__}; device=cpu")
PY
