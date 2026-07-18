// zebra is a minimal macOS host for the Zebra Markdown Editor.
//
// One binary, two roles. Invoked as `zebra <file.md> [...]` it acts as a
// client: it makes sure the background server is running (starting a detached
// copy of itself with -serve if not), then asks it to open each file in a
// Chrome app-mode window. The server embeds the whole frontend, serves it on
// a fixed localhost port, does all file I/O by absolute path, and shuts
// itself down shortly after the last window closes.
//
// The port must stay fixed across restarts: the frontend caches unsaved work
// in localStorage, which is keyed to the origin including the port.
package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// Embedded per file rather than per directory: the propagated fonts tree is
// ~340 MB of families and static weights, of which styles.css references
// exactly four files. The frontend/src patterns also make the build fail if
// propagate hasn't run yet.
//
//go:embed frontend/index.html frontend/host.js frontend/markdown-it.min.js
//go:embed frontend/src/app.js frontend/src/templates.js frontend/src/styles.css
//go:embed "frontend/src/fonts/google/Noto_Sans/NotoSans-VariableFont_wdth,wght.ttf"
//go:embed "frontend/src/fonts/google/Noto_Sans/NotoSans-Italic-VariableFont_wdth,wght.ttf"
//go:embed "frontend/src/fonts/google/Noto_Sans_Mono/NotoSansMono-VariableFont_wdth,wght.ttf"
//go:embed "frontend/src/fonts/google/Material_Symbols_Rounded/MaterialSymbolsRounded-Subset.ttf"
var frontendFS embed.FS

const (
	defaultPort  = "48632"
	appToken     = "zebra"
	chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
	// How long the server waits with zero connected windows before exiting.
	// Must comfortably outlast a page reload and Chrome's cold start.
	idleTimeout = 15 * time.Second
)

func port() string {
	if p := os.Getenv("ZEBRA_PORT"); p != "" {
		return p
	}
	return defaultPort
}

func baseURL() string { return "http://127.0.0.1:" + port() }

func dataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatalf("cannot determine home directory: %v", err)
	}
	return filepath.Join(home, "Library", "Application Support", "Zebra")
}

func profileDir() string { return filepath.Join(dataDir(), "chrome") }
func logPath() string    { return filepath.Join(dataDir(), "server.log") }

func main() {
	serve := flag.Bool("serve", false, "run as the background server (internal, used by self-re-exec)")
	flag.Parse()
	if *serve {
		runServer()
		return
	}
	if flag.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "usage: zebra <file.md> [more.md ...]")
		os.Exit(1)
	}
	runClient(flag.Args())
}

// --- Client role ---

func runClient(paths []string) {
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	switch ping() {
	case pingOK:
	case pingForeign:
		failVisibly(fmt.Sprintf("port %s is in use by another application; set ZEBRA_PORT to a free port (note: changing it abandons cached unsaved work)", port()))
	case pingDown:
		if err := spawnServer(); err != nil {
			failVisibly("could not start the background server: " + err.Error())
		}
		if !waitForPing(5 * time.Second) {
			failVisibly("the background server did not start; see the log below for details")
		}
	}
	for _, p := range paths {
		abs, err := filepath.Abs(p)
		if err != nil {
			failVisibly(fmt.Sprintf("cannot resolve path %q: %v", p, err))
		}
		body, _ := json.Marshal(map[string]string{"path": abs})
		resp, err := http.Post(baseURL()+"/api/open", "application/json", bytes.NewReader(body))
		if err != nil {
			failVisibly("cannot reach the background server: " + err.Error())
		}
		resp.Body.Close()
	}
}

type pingResult int

const (
	pingOK pingResult = iota
	pingDown
	pingForeign
)

// ping distinguishes "our server answered", "nothing is listening", and
// "something else owns the port" so a foreign process is never mistaken
// for a healthy server.
func ping() pingResult {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Get(baseURL() + "/api/ping")
	if err != nil {
		return pingDown
	}
	defer resp.Body.Close()
	var info struct {
		App string `json:"app"`
	}
	if json.NewDecoder(resp.Body).Decode(&info) != nil || info.App != appToken {
		return pingForeign
	}
	return pingOK
}

func waitForPing(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if ping() == pingOK {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

// spawnServer re-execs this binary as a fully detached daemon. The log file
// must replace stdout/stderr: Automator's "Run Shell Script" blocks until
// the script's output pipe closes, so the daemon must not inherit it.
func spawnServer() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	logFile, err := os.OpenFile(logPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer logFile.Close()
	cmd := exec.Command(exe, "-serve")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// failVisibly surfaces a fatal client error without a terminal: append it to
// the log, open the log in TextEdit, and exit.
func failVisibly(msg string) {
	line := fmt.Sprintf("%s [launcher] %s\n", time.Now().Format(time.DateTime), msg)
	if f, err := os.OpenFile(logPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		f.WriteString(line)
		f.Close()
	}
	exec.Command("open", "-e", logPath()).Start()
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}

// --- Server role ---

type server struct {
	mu           sync.Mutex
	conns        int
	lastActivity time.Time
	writeMu      sync.Mutex
}

func runServer() {
	log.SetPrefix("[zebra] ")
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		log.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port())
	if err != nil {
		// Either a race with a sibling launch (it won, the client's ping
		// polling will find it) or a foreign process on the port.
		log.Fatalf("cannot listen on port %s: %v", port(), err)
	}
	log.Printf("serving on %s (pid %d)", baseURL(), os.Getpid())

	s := &server{lastActivity: time.Now()}
	go s.watchIdle()

	fsub, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(fsub)))
	mux.HandleFunc("/api/ping", s.handlePing)
	mux.HandleFunc("/api/open", s.handleOpen)
	mux.HandleFunc("/api/read", s.handleRead)
	mux.HandleFunc("/api/save", s.handleSave)
	mux.HandleFunc("/api/alive", s.handleAlive)
	log.Fatal(http.Serve(listener, mux))
}

func (s *server) touch() {
	s.mu.Lock()
	s.lastActivity = time.Now()
	s.mu.Unlock()
}

// watchIdle exits the process once no window has been connected for
// idleTimeout. Opening a file counts as activity so the server survives the
// gap between spawning Chrome and the first page connecting.
func (s *server) watchIdle() {
	for range time.Tick(2 * time.Second) {
		s.mu.Lock()
		idle := s.conns == 0 && time.Since(s.lastActivity) > idleTimeout
		s.mu.Unlock()
		if idle {
			log.Print("no windows connected, shutting down")
			// Chrome keeps running windowless after its last window closes;
			// the profile dir only ever appears in our instance's command line.
			exec.Command("pkill", "-f", profileDir()).Run()
			os.Exit(0)
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func (s *server) handlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"app": appToken, "pid": os.Getpid()})
}

func (s *server) handleOpen(w http.ResponseWriter, r *http.Request) {
	s.touch()
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		writeError(w, http.StatusBadRequest, errors.New("a file path is required"))
		return
	}
	abs, err := filepath.Abs(req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	// No existence check here: a missing file surfaces as an alert inside
	// the opened window, which is the only error surface a Finder launch has.
	launchBrowser(baseURL() + "/?doc=" + url.QueryEscape(abs))
	writeJSON(w, http.StatusOK, map[string]string{"path": abs})
}

func (s *server) handleRead(w http.ResponseWriter, r *http.Request) {
	path := filepath.Clean(r.URL.Query().Get("path"))
	if !filepath.IsAbs(path) {
		writeError(w, http.StatusBadRequest, errors.New("path must be absolute"))
		return
	}
	content, err := os.ReadFile(path)
	if err != nil {
		status := http.StatusInternalServerError
		if os.IsNotExist(err) {
			status = http.StatusNotFound
		}
		writeError(w, status, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"path":    path,
		"name":    filepath.Base(path),
		"content": string(content),
	})
}

func (s *server) handleSave(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path    string `json:"path"`
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	path := filepath.Clean(req.Path)
	if !filepath.IsAbs(path) {
		writeError(w, http.StatusBadRequest, errors.New("path must be absolute"))
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	// Write-then-rename keeps the target intact if the write fails midway.
	// Deliberately no MkdirAll: a typo'd path must not create directories.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(req.Content), 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": path, "name": filepath.Base(path)})
}

// handleAlive is a Server-Sent Events stream each window holds open for its
// whole life. The dropped connection is how the server learns a window
// closed; the idle watcher does the rest.
func (s *server) handleAlive(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, errors.New("streaming unsupported"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	s.mu.Lock()
	s.conns++
	s.lastActivity = time.Now()
	s.mu.Unlock()

	<-r.Context().Done()

	s.mu.Lock()
	s.conns--
	s.lastActivity = time.Now()
	s.mu.Unlock()
}

// launchBrowser opens url in a Chrome app-mode window using a dedicated
// profile. Spawning the Chrome binary directly (instead of `open -a`) is what
// makes the flags reliable while the user's normal Chrome is running: a
// distinct --user-data-dir always gets its own Chrome instance. Later spawns
// hand the URL to that instance's singleton and exit on their own.
func launchBrowser(u string) {
	if _, err := os.Stat(chromeBinary); err != nil {
		// Degraded fallback: default browser, regular tab.
		log.Printf("Chrome not found, opening in default browser")
		exec.Command("open", u).Start()
		return
	}
	cmd := exec.Command(chromeBinary,
		"--app="+u,
		"--user-data-dir="+profileDir(),
		"--no-first-run",
		"--no-default-browser-check",
	)
	if err := cmd.Start(); err != nil {
		log.Printf("cannot launch Chrome: %v", err)
		return
	}
	go cmd.Wait() // reap only; shutdown uses pkill by profile dir instead of this handle
}
