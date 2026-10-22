#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-${ROOT_DIR}/.venv/bin/python}"
CXX_BIN="${CXX:-c++}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  printf 'Python interpreter not found: %s\n' "${PYTHON_BIN}" >&2
  exit 1
fi

if ! "${PYTHON_BIN}" -c 'import pybind11' >/dev/null 2>&1; then
  printf 'pybind11 is not importable from %s\n' "${PYTHON_BIN}" >&2
  exit 1
fi

PYTHON_INCLUDE="$("${PYTHON_BIN}" -c 'import sysconfig; print(sysconfig.get_path("include"))')"
PYBIND_INCLUDE="$("${PYTHON_BIN}" -c 'import pybind11; print(pybind11.get_include())')"
LOCAL_PYTHON_INCLUDE="${ROOT_DIR}/.toolchain/root/usr/include/python3.14"
if [[ -f "${LOCAL_PYTHON_INCLUDE}/Python.h" ]]; then
  # The base image provides Python 3.14 runtime files but not the dev headers.
  # Keep the extracted, project-local headers ahead of /usr/include so this
  # build does not require a system package mutation.
  PYTHON_INCLUDE="${LOCAL_PYTHON_INCLUDE}"
fi
EXT_SUFFIX="$("${PYTHON_BIN}" -c 'import sysconfig; print(sysconfig.get_config_var("EXT_SUFFIX"))')"
OUTPUT="${ROOT_DIR}/giftisland/_search${EXT_SUFFIX}"

"${CXX_BIN}" \
  -O3 -DNDEBUG -std=c++17 -fPIC -shared -fopenmp \
  "-I${ROOT_DIR}/.toolchain/root/usr/include" \
  "-I${PYTHON_INCLUDE}" "-I${PYBIND_INCLUDE}" \
  -I"${ROOT_DIR}/cpp" \
  "${ROOT_DIR}/cpp/search.cpp" \
  -o "${OUTPUT}"

printf 'Built %s\n' "${OUTPUT}"
