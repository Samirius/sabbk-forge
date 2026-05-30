# Stack rules — Python

- **Env:** Python ≥ 3.11. Use a venv: `python3 -m venv .venv && . .venv/bin/activate`.
- **Install:** `pip install -e . ruff pytest` (or your locked equivalent). Pin versions.
- **Lint:** `ruff check .` must be clean (rules: E,F,I,B,UP).
- **Format:** `ruff format --check .`.
- **Test:** `pytest` (tests in `tests/`). Add tests for new behavior.
- **Green = ** ruff check + ruff format --check + pytest all pass. The Validate stage runs these.
- No bare `except:`; type hints on public functions.
