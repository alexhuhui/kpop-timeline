# CLAUDE.md

This file tells Claude Code how to work in this repository.

## What this is

A personal K-pop bias timeline. One set of data, two renderers:

- `kpop_timeline.ipynb` (pandas + matplotlib) makes the PNG images.
- `index.html` + `app.js` + `style.css` is the interactive site on GitHub Pages
  (https://alexhuhui.github.io/kpop-timeline/).

Both read `settings.json`, `groups.csv`, `biases.csv` and `songs.csv`. Never hard-code data or
settings in either renderer. If you change how a column is read, change it in both.

## Commands

```bash
python -m http.server 8000 --bind 127.0.0.1    # preview the site (fetch() fails on file://)
jupyter nbconvert --to notebook --execute --inplace kpop_timeline.ipynb   # rebuild the PNGs
```

There is no build step, no package.json, and no tests. Deploy is `.github/workflows/pages.yml`,
which copies only the site files into `_site/`. If the site needs a new file, add it to the
`cp` line there.

## Hard constraints

- **The user pushes, not Claude.** Commit locally if asked; never `git push`, transfer, or change
  repo settings.
- **The layout copies the notebook.** `app.js` uses the same maths as the notebook: date to
  number, month counting, the four-step label de-overlap, and `darker()` = RGB × 0.62. A change to
  the chart's look goes into both, or the PNG and the site drift apart.
- **The CSP in `index.html` is a contract.** It allows `'self'`, `cdn.jsdelivr.net` (D3 only)
  and Google Fonts. No `'unsafe-eval'`: that is why `app.js` uses `d3.csvParseRows` instead of
  `d3.csv`, which builds rows with `new Function`. No `'unsafe-inline'`: no inline script, no
  `style="..."` in markup (setting `element.style` from JS is fine). If a change needs a new host,
  change the policy in the same commit and say why.
- **D3 is pinned** to `d3@7.9.0` with an SRI hash. To upgrade, change the version and the
  `integrity` hash together.
- **CSV text is data, never HTML.** Use `textContent` / d3 `.text()`. Never `innerHTML`.
  Links go through `safeYouTube()` (https + YouTube hosts only) and open with
  `rel="noopener noreferrer"`. Colours go through `safeColour()`.
- **Mobile:** touch targets are at least 44px, form controls at 16px, and the page never scrolls
  sideways. The card is a bottom sheet under 600px.
- **Light theme only.** The bias colours were chosen for white.
- `Inter/` is in `.gitignore` on purpose (21 MB, and the notebook only uses installed fonts).

## Rulebooks

`rulebooks/` holds general principle files (UI-UX, Security, Engineering). They are reference
only. Read the one that the change needs, using the routing table in `rulebooks/README.md`.
Do not copy them into this file.
