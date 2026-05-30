# Project-Config Templates

Starter configs so a Pi Coding Agent begins a new build on known-good ground instead of guessing.
When a coding task targets a stack, copy the matching folder into the project workdir as the baseline,
then build on it.

| Stack | Folder | Ships |
|---|---|---|
| Node / TypeScript | `node-ts/` | `package.json` (build/typecheck/test/lint scripts), `tsconfig.json`, `AGENTS.md` |
| Python | `python/` | `pyproject.toml` (ruff + pytest), `AGENTS.md` |
| Static / Astro | `astro/` | `package.json`, `astro.config.mjs`, `AGENTS.md` |

Each `AGENTS.md` is the stack's hard build rules (how to install, build, test, and what "green" means) so
the agent's Validate stage has an unambiguous target. The Astro template mirrors the real Banafah portal
stack (Astro static site) so client-adjacent technical work starts from a familiar shape.

These are **starters**, not forged Sabbk product — adapt per project. Per-stack build jigs
(`build-passes`, `types-pass`) are a P2 follow-up that will plug into each template's `AGENTS.md`.
