# Stack rules — Node / TypeScript

- **Install:** `npm ci` (or `npm install` first time). Pin deps exact; commit the lockfile.
- **Build:** `npm run build` must succeed (no `tsc` errors).
- **Typecheck:** `npm run typecheck` must be clean — `strict` is on; do not weaken it.
- **Test:** `npm test` (node:test). Add tests for new behavior.
- **Green = ** build + typecheck + test all pass. The Validate stage runs these and records results.
- Source in `src/`; build output in `dist/` (gitignored). No `any` to silence types — fix the type.
