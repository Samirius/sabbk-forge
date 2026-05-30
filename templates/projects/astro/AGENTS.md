# Stack rules — Static / Astro

- **Install:** `npm ci` (or `npm install`). Pin deps exact; commit the lockfile.
- **Dev:** `npm run dev` (local preview). **Build:** `npm run build` → `dist/` must build clean.
- **Check:** `npm run check` (`astro check`) must pass — no broken links/types in components.
- **Green = ** build + check pass. The Validate stage runs these and records results.
- Content/pages in `src/pages/`; layouts in `src/layouts/`; assets in `public/`. Keep it static unless a
  feature truly needs SSR. This mirrors the real Banafah portal so client-adjacent work starts familiar.
