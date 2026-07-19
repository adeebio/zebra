# pwa host

The browser-installable Zebra host: a static, framework-free PWA (plain
`index.html`, no bundler) that runs entirely client-side and installs like a
native app in any Chromium browser. Deployed to GitHub Pages.

Requirements: none to run (any modern browser); Node.js to propagate `/src`
before serving locally.

## Build

From the repo root:

```sh
make propagate
```

This copies `/src` into `hosts/pwa/src`. There's no bundling step — the
propagated files are served as-is.

### Development

```sh
make propagate
npx serve hosts/pwa
```

Re-run `make propagate` after editing anything in `/src`; `npx serve` (or any
static file server) doesn't need restarting.

## Open/save behaviour

`host.js` implements `window.host` against the File System Access API
(`showOpenFilePicker`/`showSaveFilePicker`), so Open and Save touch a real
local file — only available in Chromium-based browsers. In browsers without
that API, `window.host` is left unset and `src/app.js` falls back to its
built-in file-input/download behaviour.

## Offline support

`sw.js` is a cache-first service worker covering the app shell (HTML, CSS,
JS, icons). It's registered from `host.js` on load. Bump `CACHE_NAME` in
`sw.js` whenever any app-shell file changes (not just the file list), so old
caches get cleared out on the next visit.

`CACHE_NAME` follows the convention `zebra-pwa-YYMMDDEE`, where `YY` is the
two-digit year, `MM` the month, `DD` the date, and `EE` a two-digit counter
for multiple releases on the same day (`01`, `02`, …), resetting each new
date. For example, the second release on 19 July 2026 is
`zebra-pwa-26071902`.

## Deployment

`.github/workflows/deploy-pwa.yml` propagates `/src` and deploys
`hosts/pwa/` to GitHub Pages on every push to `master` that touches `/src`,
`hosts/pwa/`, or the propagate script (also runnable manually via
`workflow_dispatch`). One-time setup required in the GitHub repo: **Settings
→ Pages → Source: GitHub Actions**.

## Known limitations

- The File System Access API is Chromium-only; Firefox/Safari users get the
  core's fallback file-input/download behaviour instead of real local file
  access.
- Installability (the browser's install prompt) depends on the manifest and
  service worker being served over HTTPS — works on GitHub Pages, but not
  over a plain `file://` URL.
