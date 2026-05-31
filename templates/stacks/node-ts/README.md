# Project Config — Node/TypeScript

> Template for Pi Software coding agents working on Node/TypeScript projects.
> Copy to `sabbk-clients/<client>/PROJECT.md` and fill in the specifics.

## Stack
- **Runtime:** Node.js ≥ 22
- **Language:** TypeScript (strict mode)
- **Package manager:** npm (exact versions, `npm-shrinkwrap.json`)
- **Build:** `npm run build`
- **Test:** `npm test`
- **Lint:** `npm run lint` (eslint + prettier)

## File structure (convention)
```
src/
  index.ts          # Entry point
  lib/              # Core logic
  routes/           # API routes (if applicable)
  types/            # Shared types
tests/
  *.test.ts         # Unit tests (vitest or jest)
```

## Pre-build checks
1. `npm ci` — clean install from lock
2. `npx tsc --noEmit` — type check
3. `npm run lint` — style check
4. `npm run build` — compile
5. `npm test` — all tests pass

## Validation jig template
```bash
#!/usr/bin/env bash
# jigs/<client>-node-jig.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "── types-pass"; npx tsc --noEmit && echo "✓"
echo "── lint-pass"; npm run lint && echo "✓"
echo "── build-pass"; npm run build && echo "✓"
echo "── test-pass"; npm test && echo "✓"
echo "✅ all checks passed"
```

## Common tools
- **Framework:** Express / Fastify / Hono (specify in project)
- **ORM:** Prisma / Drizzle (specify in project)
- **Validation:** Zod
- **Testing:** Vitest

## Agent notes
- Use `edit` tool for changes, not full file rewrites
- Run type check after every change batch
- Keep the diff small — one logical change per commit
