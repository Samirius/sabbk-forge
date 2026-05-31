# Project Config — Python

> Template for Pi Software coding agents working on Python projects.
> Copy to `sabbk-clients/<client>/PROJECT.md` and fill in the specifics.

## Stack
- **Runtime:** Python 3.11+
- **Package manager:** pip + venv or uv
- **Build:** `pip install -e .` or `uv sync`
- **Test:** `pytest`
- **Lint:** `ruff check` + `ruff format`
- **Type check:** `mypy` or `pyright`

## File structure (convention)
```
src/
  __init__.py
  main.py           # Entry point
  models/           # Data models
  services/         # Business logic
  routes/           # API routes (if applicable)
tests/
  test_*.py         # Unit tests
  conftest.py       # Pytest fixtures
pyproject.toml      # Project config
```

## Pre-build checks
1. `python -m venv .venv && source .venv/bin/activate` — environment
2. `pip install -e ".[dev]"` — install with dev deps
3. `ruff check src/` — lint
4. `ruff format --check src/` — format check
5. `pytest` — all tests pass

## Validation jig template
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "── lint-pass"; ruff check src/ && echo "✓"
echo "── format-pass"; ruff format --check src/ && echo "✓"
echo "── test-pass"; pytest -q && echo "✓"
echo "✅ all checks passed"
```

## Common tools
- **Framework:** FastAPI / Flask / Django (specify in project)
- **ORM:** SQLAlchemy / Django ORM
- **Validation:** Pydantic
- **Testing:** pytest + pytest-cov

## Agent notes
- Use `edit` tool for changes
- Run lint after every change batch
- Follow PEP 8 (enforced by ruff)
