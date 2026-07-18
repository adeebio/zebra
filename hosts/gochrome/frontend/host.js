// Adapter for the gochrome host: implements window.host against the
// local Go server's JSON API. The window's document is the absolute file
// path carried in the ?doc= query parameter — there is no other window/file
// state anywhere, which is what makes reloads work even across server
// restarts.

// The absolute path this window was opened for, or null for a blank window.
let docPath = new URLSearchParams(window.location.search).get('doc');

// Held open for the lifetime of the window; the server shuts itself down
// once no window has had one of these connected for a while.
new EventSource('/api/alive');

// Keep the URL in sync after Open/Save-As so a reload shows the same file.
function setDoc(path) {
  docPath = path;
  const query = path ? '?doc=' + encodeURIComponent(path) : window.location.pathname;
  window.history.replaceState(null, '', query);
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function readFile(path) {
  return request('/api/read?path=' + encodeURIComponent(path));
}

window.host = {
  async open() {
    const path = window.prompt('Absolute path of the markdown file to open:');
    if (!path || !path.trim()) return null; // treated as cancel
    try {
      const result = await readFile(path.trim());
      setDoc(result.path);
      return { path: result.path, name: result.name, content: result.content };
    } catch (err) {
      alert(`Cannot open ${path.trim()}: ${err.message}`);
      return null;
    }
  },

  async save(path, name, content) {
    let target = path;
    if (!target) {
      // Save-As: suggest the current file's directory, or just the name.
      const dir = docPath ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
      const answer = window.prompt('Save as — absolute path:', dir + name);
      if (!answer || !answer.trim()) return null; // user cancelled
      target = answer.trim();
    }
    try {
      const result = await request('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target, name, content }),
      });
      setDoc(result.path);
      return { path: result.path, name: result.name };
    } catch (err) {
      alert(`Cannot save ${target}: ${err.message}`);
      return null;
    }
  },

  // The file this window was opened for. Re-read from disk on every load,
  // so a reload always shows the file's current content — no pending state
  // is kept anywhere. Never throws: on failure the core falls back to its
  // cached document.
  async getPendingFile() {
    if (!docPath) return null;
    try {
      const result = await readFile(docPath);
      return { path: result.path, name: result.name, content: result.content };
    } catch (err) {
      alert(`Cannot open ${docPath}: ${err.message}`);
      return null;
    }
  },

  // Deliberate no-op: in this host a window is bound to one document for its
  // whole life. Files opened from Finder or the CLI always arrive as new
  // Chrome windows, so nothing ever hands a file to an existing window.
  onFileOpened(_callback) {},
};
