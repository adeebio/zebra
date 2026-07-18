# gochrome host

The most lightweight Zebra host: a single pure-Go binary (`zebra`, stdlib
only, no cgo) that embeds the whole frontend, serves it from a local
webserver, and shows each document in a Chrome app-mode window — no address
bar, tabs, or bookmarks. Finder double-click support comes from a tiny
Automator wrapper app you create once (see below).

Requirements: macOS, Google Chrome (falls back to the default browser in a
regular tab if Chrome is missing), and the Go toolchain to build.

## Build

From the repo root:

```sh
make gochromebuild
```

This propagates `/src` into `frontend/src` and builds
`hosts/gochrome/bin/zebra`. Running `go build` here without propagating
first fails on the `//go:embed frontend/src` directive — that is deliberate,
so a binary can never ship without the app inside it.

The binary is fully self-contained; copy it somewhere stable (e.g.
`~/Applications/zebra`) so the Automator app's hardcoded path survives
repo moves and rebuilds can be dropped in over it.

### Development

```sh
make propagate
cd hosts/gochrome && go run . ../../test.md
```

`go run` re-embeds the current frontend on every invocation, so it doubles as
the dev loop. The compiled binary is for daily/Automator use: no Go toolchain
at runtime, a stable path, and instant starts.

## Usage

```sh
zebra <file.md> [more.md ...]
```

Each file opens in its own window. The first invocation starts a background
server (~1 s); later ones reuse it and return instantly. The server shuts
itself down about 15 seconds after the last window closes — there is nothing
to quit and no terminal is ever shown.

## Automator app (Finder double-click)

macOS delivers "open this file" to an app as an Apple Event, which a plain Go
binary cannot receive. The Automator app is the one place macOS pumps that
event for us and hands the path over as a plain shell argument.

1. Open **Automator** → File → New → **Application**.
2. Add a **Run Shell Script** action.
3. Set Shell to `/bin/zsh` and **Pass input** to **"as arguments"**.
4. Replace the script body with (adjust the path to where you put the binary):

   ```sh
   exec "$HOME/Applications/zebra" "$@"
   ```

5. Save as `Zebra` in `/Applications` (File Format: Application).
6. Optional: give it an icon — Get Info on `Zebra.app`, click the icon at the
   top left, and paste an image.

### Associate .md files

1. In Finder, select any `.md` file and **Get Info**.
2. Under **Open with:**, choose `Zebra.app` (Other… → All Applications if it
   isn't listed).
3. Click **Change All…** → Continue.

Double-clicking any `.md` file now opens it in a Zebra window. The first
launch may need a right-click → Open to satisfy Gatekeeper.

## Lifecycle & troubleshooting

- The server keeps running while any window is open and exits ~15 s after the
  last one closes (it also cleans up the windowless Chrome instance macOS
  leaves behind).
- Log: `~/Library/Application Support/Zebra/server.log`. Launch errors (port
  conflicts, server failing to start) open this file in TextEdit
  automatically.
- Stuck process: `pkill -f zebra`.
- Port conflict: the server listens on `127.0.0.1:48632`. Set `ZEBRA_PORT`
  to override — but note the editor's unsaved-work cache lives in
  localStorage, which is keyed to the port, so changing it abandons that
  cache.
- Chrome profile: the app windows use a dedicated Chrome profile at
  `~/Library/Application Support/Zebra/chrome` (this is what makes the
  chrome-less window flags reliable while your normal Chrome is running).
  Deleting that directory resets the host, including cached unsaved work.

## Known limitations

- The same file can be opened in two windows; the last save wins.
- All windows share one localStorage cache slot (inherent to the core), so a
  crash cache only preserves the most recently saved document.
- Open and Save-As are paste-an-absolute-path prompts.
