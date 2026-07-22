# Submission PDFs — source

HTML sources for the HackCanton submission PDFs. Same design system as the live app
(Gloock / Hanken Grotesk / IBM Plex Mono, dark theme). Rendered to PDF with headless
Chromium, so what you edit here is exactly what ships.

| Source | Ships as |
|---|---|
| `deck.html` (9 slides, 16:9) | `docs/ledgerfactor-pitch.pdf`, `web/public/pitch.pdf` |
| `value.html` | `docs/ledgerfactor-value-statement.pdf`, `web/public/value.pdf` |
| `gtm.html` | `docs/ledgerfactor-gtm.pdf`, `web/public/gtm.pdf` |
| `icp.html` | `docs/ledgerfactor-icp.pdf`, `web/public/icp.pdf` |
| `metrics.html` | `docs/ledgerfactor-metrics.pdf`, `web/public/metrics.pdf` |

`op.css` is the shared one-pager stylesheet. `img/` holds the deck's two live-app
screenshots (money-shot + Veild auction), recaptured from the running product.

## Rebuild

```bash
npm --prefix web run build          # once, so the fonts exist under web/dist/assets
docs/decks/build.sh                 # renders all 5 PDFs and copies them into place
npm --prefix web run build && sudo rsync -a --delete web/dist/ /var/www/ledgerfactor/
```

`build.sh` pulls the fonts from `web/dist/assets` into `docs/decks/fonts/` (gitignored)
at render time; no fonts are committed here.

## Keep it true

Every number is reproducible from the repo — re-check before editing:
`daml test` (test counts on the deck / metrics), `npm --prefix server test` (10/10),
and the live money-shot figures. Say "party views", not "nodes": one Canton
participant hosts four parties. Lowest-wins in Veild is a server convention, not a
ledger rule.
