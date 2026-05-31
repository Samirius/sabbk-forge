# Project Config — Astro (Static Site)

> Template for Pi Software coding agents working on Astro static sites.
> This is the Banafah portal stack.
> Copy to `sabbk-clients/<client>/PROJECT.md` and fill in the specifics.

## Stack
- **Runtime:** Node.js ≥ 22
- **Framework:** Astro 6+
- **Styling:** CSS (scoped) / Tailwind
- **Build:** `npm run build` → static HTML in `dist/`
- **No tests** — static site, validated by build + visual inspection

## File structure (convention)
```
src/
  layouts/           # Base.astro + variants
  pages/             # File-based routing
    index.astro      # Home
    <section>/
      index.astro    # Section landing
      *.md           # Markdown content pages
  data/              # JSON data files (catalog, images, etc.)
  components/        # Reusable Astro components (if any)
public/
  assets/
    editorial/       # Branded editorial images
    photos/          # Real product photos
    videos/          # Product films + TikTok beats
    adcreatives/     # Ad creative images
astro.config.mjs
```

## Pre-build checks
1. `npm ci` — clean install
2. `npx astro check` — type/lint check
3. `npm run build` — static build (output to `dist/`)

## Validation jig template
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "── astro-check"; npx astro check && echo "✓"
echo "── build-pass"; npm run build && echo "✓"
echo "── pages-generated"; test -d dist && echo "✓"
echo "✅ all checks passed"
```

## Deploy
- **Hostinger:** rsync `dist/` to shared hosting doc root
- **Cloudflare Pages:** connect GitHub repo, auto-deploy
- **Local preview:** `python3 -m http.server 8765 --directory dist`

## Agent notes
- Content pages use `.md` files with YAML frontmatter (layout, title, crumb)
- Astro auto-generates routes from `src/pages/` file structure
- Asset references: `/assets/<type>/<filename>` (absolute from public/)
- Don't modify `dist/` directly — it's generated
- For new pages: create the `.md` or `.astro` file, add to sidebar nav in `layouts/Base.astro`, rebuild
