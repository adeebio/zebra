# localdevserver host

A super simple Node server for testing changes to `/src` locally, as fast as
possible: no build step, no propagate step, no bundler. Unlike `pwa` and
`gochrome`, this host doesn't keep its own copy of `/src` — it serves the
repo root's `/src` directly, so edits show up on refresh with nothing in
between.

Requirements: Node.js only (uses `node:http`/`node:fs`, no npm dependencies).
`markdown-it` is served straight out of the repo root's `node_modules`, so
run `npm install` at the repo root first if you haven't already.

## Run

```sh
node hosts/localdevserver/server.js
```

or, from the repo root:

```sh
make devserver
```

Then open `http://localhost:3000`.

## Port

Override the default port with the `PORT` env var:

```sh
PORT=4000 node hosts/localdevserver/server.js
```

## Limitations

This host is for local development only, not deployment:

- No service worker, no offline support.
- No `host.js` adapter for real local file access — Open/Save fall back to
  `src/app.js`'s built-in file-input/download behaviour.
- No path is exposed outside `/src`, the host's own `index.html`, and
  `node_modules/markdown-it/dist`.
