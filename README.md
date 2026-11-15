# Rebirth Web Design — home page

Astro 7 + Tailwind 4 + GSAP 3.15. Layout and motion modelled on useorigin.com; copy from rebirthwebdesign.com.au; photos hotlinked from Unsplash.

    npm install && npm run dev      # http://localhost:4321
    npm run build                   # static output in dist/

- `src/pages/index.astro` — the page; one component per section in `src/components/sections/`
- `src/styles/global.css` — Tailwind `@theme` tokens (fonts, colours)
- `src/data/images.ts` — the six Unsplash photos (IDs, credits, placeholder colours)
- `docs/COPY.md` — every text slot mapped from the old site, with gaps listed
- `dev-previews/` — single-section pages used during the build; copy one into `src/pages/preview/` to isolate a section
- `tools/shot.mjs`, `tools/diff.mjs` — screenshot and side-by-side comparison helpers (need Google Chrome at /usr/bin/google-chrome)

Not included: the pages the links point to (/about, /ai-tools, /blog, /contact, /terms, /privacy).
Fonts are free stand-ins: Newsreader for Lyon Display, Inter for Suisse Intl; Roboto Mono matches the reference.
