// Adapter for the local PWA host: implements window.host against the
// File System Access API so opening and saving touch a real local file.
// Only defined when the API is available (Chromium browsers) — elsewhere
// window.host is left unset and src/app.js falls back to its built-in
// file-input/download behaviour.

if ('showOpenFilePicker' in window) {
  const handles = new Map();
  let nextId = 1;

  async function readHandle(handle) {
    const file = await handle.getFile();
    return { name: file.name, content: await file.text() };
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
      const id = 'handle-' + nextId++;
      handles.set(id, handle);
      const { name, content } = await readHandle(handle);
      return { path: id, name, content };
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
        id = 'handle-' + nextId++;
        handles.set(id, handle);
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
