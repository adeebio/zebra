# Zebra Markdown Editor

A minimal section-based markdown editor.

## Layout

- `/src` — the app core: markup, styles, templates, and application logic.
  Framework-free, plain ES modules.
- `/hosts` — distributions that embed the core. Each host copies `/src` in
  at build time via `scripts/propagate.js` and adds its own thin
  integration layer (`host.js`, implementing `window.host` against
  whatever native file-system API that host has available):
  - [`hosts/gochrome`](hosts/gochrome/README.md) — a single Go binary that
    serves the app locally and opens it in a Chrome app-mode window.
  - [`hosts/pwa`](hosts/pwa/README.md) — a static, installable PWA deployed
    to GitHub Pages.
- `/specs` — the app's specifications (`specs-YYMMDDEE.md`) and reference
  images.
- `/scripts` — build tooling, currently just `propagate.js`.

## Build

```sh
make propagate       # copy /src into every host
make gochromebuild    # propagate + build the gochrome binary
```

See each host's own README for host-specific dev/build/deploy instructions.
