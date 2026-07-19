// Adapter for the local PWA host: implements window.host against the
// File System Access API so opening and saving touch a real local file.
// Only defined when the API is available (Chromium browsers) — elsewhere
// window.host is left unset and src/app.js falls back to its built-in
// file-input/download behaviour.

if ('showOpenFilePicker' in window) {
  const handles = new Map();
  let nextId = 1;

  function registerHandle(handle) {
    const id = 'handle-' + nextId++;
    handles.set(id, handle);
    return id;
  }

  async function readHandle(handle) {
    const file = await handle.getFile();
    return { name: file.name, content: await file.text() };
  }

  // Files opened via the OS (double-click, "Open With…") arrive through the
  // File Handling API's launch queue, not showOpenFilePicker. The consumer
  // fires once per launch, in order; for a cold launch with a file that
  // happens before app.js's DOMContentLoaded handler asks for it below, so
  // the first delivery is captured into a promise instead of a callback.
  // A launch with no file (the common case: opening the app normally) never
  // invokes the consumer at all, so pendingFile races against a short
  // timeout rather than waiting on it forever.
  let resolvePending;
  const pendingFile = 'launchQueue' in window
    ? Promise.race([
        new Promise((resolve) => { resolvePending = resolve; }),
        new Promise((resolve) => setTimeout(() => resolve(null), 300)),
      ])
    : Promise.resolve(null);
  let firstLaunch = true;
  let onOpened = null;

  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      const handle = launchParams.files && launchParams.files[0];
      const result = handle
        ? { path: registerHandle(handle), ...(await readHandle(handle)) }
        : null;
      if (firstLaunch) {
        firstLaunch = false;
        resolvePending(result);
      } else if (result && onOpened) {
        onOpened(result);
      }
    });
  }

  window.host = {
    async open() {
      let handle;
      try {
        [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
        });
      } catch {
        return null; // user cancelled the picker
      }
      const id = registerHandle(handle);
      const { name, content } = await readHandle(handle);
      return { path: id, name, content };
    },

    async getPendingFile() {
      return pendingFile;
    },

    onFileOpened(callback) {
      onOpened = callback;
    },

    // Silent when a handle is already known (auto-save on every section
    // save); only prompts a picker the first time a document is saved.
    async save(path, name, content) {
      let handle = path ? handles.get(path) : null;
      let id = path;
      if (!handle) {
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
          });
        } catch {
          return null; // user cancelled the picker
        }
        id = registerHandle(handle);
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      const file = await handle.getFile();
      return { path: id, name: file.name };
    },
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
