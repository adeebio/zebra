/* ==========================================================================
   Zebra Markdown Editor — Application
   ========================================================================== */

import { rootTemplate, sectionTemplate, headerActionsTemplate, menuDropdownTemplate } from './templates.js';

// --- Application State ---
const state = {
  filename: 'document.md',
  filePath: '',              // Native filesystem path (set once opened/saved via an adapter)
  sections: [],             // Array of raw markdown strings, one per section
  activeSectionIndex: null, // Index of section in edit mode (null = read-only)
  highlightedIndex: null,   // Index of section that is keyboard-highlighted
  menuOpen: false,
  headerColor: null,        // null = use the CSS default (--header-bg)
  footerColor: null         // null = use the CSS default (--footer-bg)
};

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  document.body.innerHTML = rootTemplate();
  initListeners();
  loadColors();

  // If the OS launched/activated the app with a file (double-click,
  // "Open With…"), a Go-side handler may have already captured it before
  // our event listener below could register. Pull it explicitly first so we
  // never briefly show a blank document before swapping to it. This must
  // never block booting the app — fall through to a fresh document below
  // if the native adapter isn't available or the call fails for any reason.
  let pending = null;
  if (window.host && window.host.getPendingFile) {
    try {
      pending = await window.host.getPendingFile();
    } catch {
      pending = null;
    }
  }

  if (pending) {
    loadDocument(pending.name, pending.content);
    state.filePath = pending.path || '';
  } else {
    // A plain launch (opening the app directly, or a new window) always
    // starts a fresh, unsaved document — never the previously open file.
    loadNewDocument();
    render();
  }

  // Covers the app already being open when a file is opened via the OS.
  if (window.host && window.host.onFileOpened) {
    window.host.onFileOpened((result) => {
      loadDocument(result.name, result.content);
      state.filePath = result.path || '';
    });
  }
});

// ==========================================================================
// Listeners
// ==========================================================================

function initListeners() {
  // Filename input
  document.getElementById('filename-input').addEventListener('change', (e) => {
    let name = e.target.value.trim() || 'Untitled.md';
    if (!name.endsWith('.md')) name += '.md';
    state.filename = name;
    e.target.value = name;
  });

  // Header action buttons (edit / save / cancel / menu)
  document.getElementById('header-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    handleHeaderAction(btn.dataset.action);
  });

  // Menu dropdown items
  document.getElementById('menu-dropdown').addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    closeMenu();
    if (item.dataset.action === 'open') openDocument();
    else if (item.dataset.action === 'export') exportDocument();
  });

  // Menu dropdown color pickers
  document.getElementById('menu-dropdown').addEventListener('input', (e) => {
    if (e.target.id === 'header-color-input') {
      state.headerColor = e.target.value;
      applyColors();
      saveColors();
    } else if (e.target.id === 'footer-color-input') {
      state.footerColor = e.target.value;
      applyColors();
      saveColors();
    }
  });

  // Clicks on section container (delegated)
  document.getElementById('document-sections').addEventListener('click', (e) => {
    if (e.target.closest('.section-editor')) return;
    if (e.target.tagName === 'A') return;

    const sectionEl = e.target.closest('.section');
    if (!sectionEl) return;

    handleSectionClick(parseInt(sectionEl.dataset.index, 10));
  });

  // Clicking outside an active section saves it; clicking outside the menu closes it
  document.addEventListener('mousedown', (e) => {
    if (state.menuOpen && !e.target.closest('.menu-dropdown') && !e.target.closest('.btn-menu')) {
      closeMenu();
    }

    if (state.activeSectionIndex === null) return;
    if (e.target.closest('.header-actions')) return;
    const activeEl = document.querySelector(
      `.section[data-index="${state.activeSectionIndex}"]`
    );
    if (activeEl && !activeEl.contains(e.target)) {
      saveActiveSection();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

// ==========================================================================
// Header Actions
// ==========================================================================

function handleHeaderAction(action) {
  if (action === 'edit') enterEditMode(state.highlightedIndex);
  else if (action === 'save') saveActiveSection();
  else if (action === 'cancel') cancelEditing();
  else if (action === 'menu') toggleMenu();
}

function toggleMenu() {
  state.menuOpen = !state.menuOpen;
  renderMenu();
}

function closeMenu() {
  if (!state.menuOpen) return;
  state.menuOpen = false;
  renderMenu();
}

function renderMenu() {
  document.getElementById('menu-dropdown').innerHTML = menuDropdownTemplate(state.menuOpen, {
    headerColor: effectiveColor('--header-bg', state.headerColor),
    footerColor: effectiveColor('--footer-bg', state.footerColor)
  });
}

// ==========================================================================
// Keyboard Handler
// ==========================================================================

function handleKeydown(e) {
  const isMod = e.metaKey || e.ctrlKey;

  // --- Editing ---
  if (state.activeSectionIndex !== null) {
    if (isMod && e.key === 'Enter')  { e.preventDefault(); saveActiveSection(); return; }
    if (e.key === 'Escape')          { e.preventDefault(); cancelEditing(); return; }
    return; // let all other keys reach the editor
  }

  // --- Section highlighted ---
  if (state.highlightedIndex !== null) {
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveHighlight(-1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1);  return; }
    if (e.key === 'Enter')     { e.preventDefault(); enterEditMode(state.highlightedIndex); return; }
    if (e.key === 'Escape')    { e.preventDefault(); setHighlight(null); return; }
    return;
  }

  // --- Nothing highlighted ---
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    highlightCentreSection();
  }
}

// ==========================================================================
// Highlight Navigation
// ==========================================================================

function highlightCentreSection() {
  const sections = getPreparedSections();
  if (!sections.length) return;

  const viewportMid = window.scrollY + window.innerHeight / 2;
  let bestIndex = 0, bestDist = Infinity;

  sections.forEach((_, i) => {
    const el = document.querySelector(`.section[data-index="${i}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const elMid = window.scrollY + rect.top + rect.height / 2;
    const dist = Math.abs(elMid - viewportMid);
    if (dist < bestDist) { bestDist = dist; bestIndex = i; }
  });

  setHighlight(bestIndex);
}

function moveHighlight(dir) {
  const count = getPreparedSections().length;
  if (!count) return;

  const next = Math.max(0, Math.min(count - 1, (state.highlightedIndex ?? 0) + dir));
  setHighlight(next);

  const el = document.querySelector(`.section[data-index="${next}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setHighlight(index) {
  state.highlightedIndex = index;
  render();
}

// ==========================================================================
// Edit Mode
// ==========================================================================

function handleSectionClick(targetIndex) {
  if (state.activeSectionIndex !== null) return;
  setHighlight(targetIndex);
}

function enterEditMode(index) {
  if (index === null) return;
  state.highlightedIndex = null;
  state.activeSectionIndex = index;
  render();

  const editor = document.querySelector(
    `.section[data-index="${index}"] .section-editor`
  );
  if (editor) focusEnd(editor);
}

function saveActiveSection() {
  if (state.activeSectionIndex === null) return;

  const editor = document.querySelector(
    `.section[data-index="${state.activeSectionIndex}"] .section-editor`
  );
  if (!editor) return;

  const oldIndex = state.activeSectionIndex;
  state.sections[state.activeSectionIndex] = editor.innerText;

  // Re-split entire document — handles splits and merges
  state.sections = splitIntoSections(state.sections.join('\n'));
  state.activeSectionIndex = null;
  state.highlightedIndex = Math.max(0, Math.min(getPreparedSections().length - 1, oldIndex));

  persistDocument();
  render();
}

function cancelEditing() {
  const oldIndex = state.activeSectionIndex;
  state.activeSectionIndex = null;
  state.highlightedIndex = oldIndex;
  render();
}

function focusEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ==========================================================================
// Section Splitting
// ==========================================================================

function splitIntoSections(text) {
  if (!text) return [''];

  const lines = text.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && (current.length > 0 || sections.length > 0)) {
      sections.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0 || sections.length === 0) {
    sections.push(current.join('\n'));
  }

  // A heading-less first section that becomes empty merges into the section below it.
  while (sections.length > 1 && sections[0].trim() === '') {
    sections.shift();
  }

  return sections;
}

function getPreparedSections() {
  const copy = [...state.sections];
  // Always ensure a token empty section at the end
  if (copy.length === 0 || copy[copy.length - 1].trim() !== '') {
    copy.push('');
  }
  return copy;
}

// ==========================================================================
// Markdown Parser (using markdown-it)
// ==========================================================================

const md = window.markdownit({
  html: true,
  linkify: true,
  breaks: true
});

function parseMarkdown(text) {
  if (!text) return '';
  return md.render(text);
}

// ==========================================================================
// Render
// ==========================================================================

function render() {
  const container = document.getElementById('document-sections');
  const sections = getPreparedSections();

  container.innerHTML = sections
    .map((text, index) => {
      const isEditing     = index === state.activeSectionIndex;
      const isHighlighted = index === state.highlightedIndex && !isEditing;
      const isToken       = index === sections.length - 1 && text === '';

      return sectionTemplate({
        index,
        isEditing,
        isHighlighted,
        isToken,
        text,
        html: isEditing || isToken ? '' : parseMarkdown(text)
      });
    })
    .join('');

  // Plain-text paste on the active editor (element is rebuilt on every render)
  const editor = container.querySelector('.section-editor');
  if (editor) {
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const plain = e.clipboardData.getData('text/plain');
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(plain));
      sel.collapseToEnd();
    });
  }

  document.getElementById('header-actions').innerHTML = headerActionsTemplate({
    isEditing: state.activeSectionIndex !== null,
    isHighlighted: state.highlightedIndex !== null
  });
  renderMenu();
}

// ==========================================================================
// Persistence
// ==========================================================================

function getDocumentText() {
  const sections = [...state.sections];
  if (sections.length && sections[sections.length - 1].trim() === '') sections.pop();
  return sections.join('\n');
}

function applyColors() {
  const root = document.documentElement;
  if (state.headerColor) root.style.setProperty('--header-bg', state.headerColor);
  else root.style.removeProperty('--header-bg');
  if (state.footerColor) root.style.setProperty('--footer-bg', state.footerColor);
  else root.style.removeProperty('--footer-bg');
}

function saveColors() {
  if (state.headerColor) localStorage.setItem('md_editor_header_color', state.headerColor);
  else localStorage.removeItem('md_editor_header_color');
  if (state.footerColor) localStorage.setItem('md_editor_footer_color', state.footerColor);
  else localStorage.removeItem('md_editor_footer_color');
}

function loadColors() {
  state.headerColor = localStorage.getItem('md_editor_header_color') || null;
  state.footerColor = localStorage.getItem('md_editor_footer_color') || null;
  applyColors();
}

// Resolves a colour for the picker's value: the user's saved choice, or
// else the CSS default currently in effect (so the swatch matches reality).
function effectiveColor(varName, stateColor) {
  if (stateColor) return stateColor;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return rgbToHex(value) || '#a0a0a0';
}

function rgbToHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return '#' + match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

// Saving a section persists the whole document — when the document was
// opened from (or already saved to) a real file — to the file on disk,
// silently, without a save dialog.
function persistDocument() {
  if (window.host && state.filePath) {
    window.host.save(state.filePath, state.filename, getDocumentText()).then((result) => {
      if (!result) return;
      state.filePath = result.path;
      state.filename = result.name;
    });
  }
}

// A fresh, blank, unsaved document: the first save prompts for a location.
function loadNewDocument() {
  state.filename = 'document.md';
  state.filePath = '';
  state.sections = [''];
  document.getElementById('filename-input').value = state.filename;

  // By default, the trailing token section is highlighted.
  state.highlightedIndex = getPreparedSections().length - 1;
}

// ==========================================================================
// Open
// ==========================================================================

function openDocument() {
  if (window.host) {
    window.host.open().then((result) => {
      if (!result) return; // cancelled
      loadDocument(result.name, result.content);
      state.filePath = result.path || '';
    });
    return;
  }

  // Plain-browser fallback: pick a local file with a hidden file input
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: '.md,.markdown'
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadDocument(file.name, reader.result);
    reader.readAsText(file);
  });
  input.click();
}

function loadDocument(name, content) {
  state.filename = name;
  state.activeSectionIndex = null;
  state.sections = splitIntoSections(content);
  state.highlightedIndex = getPreparedSections().length - 1;
  document.getElementById('filename-input').value = name;
  render();
}

// ==========================================================================
// Export
// ==========================================================================

function exportDocument() {
  const text = getDocumentText();

  if (window.host) {
    window.host.save(state.filePath, state.filename, text).then((result) => {
      if (!result) return; // cancelled
      state.filePath = result.path;
      state.filename = result.name;
      document.getElementById('filename-input').value = result.name;
    });
    return;
  }

  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: state.filename
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
