/* ==========================================================================
   Zebra Markdown Editor — HTML Templates
   ========================================================================== */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- App shell ---

export function rootTemplate() {
  return `
    <header class="editor-header">
      <div class="header-inner">
        <input type="text" id="filename-input" class="filename-input" value="document.md" spellcheck="false">
        <div class="header-actions" id="header-actions"></div>
      </div>
      <div class="menu-dropdown" id="menu-dropdown"></div>
    </header>

    <div class="doc-spacer-top"></div>
    <main class="document-container">
      <div id="document-sections" class="document-sections"></div>
    </main>
    <div class="doc-spacer-bottom"></div>

    <footer class="editor-footer"></footer>
  `;
}

// --- Header actions ---

function iconButton(action, icon, title) {
  return `<button class="icon-btn btn-${action}" data-action="${action}" title="${title}"><span class="icon">${icon}</span></button>`;
}

export function headerActionsTemplate({ isEditing, isHighlighted }) {
  let html = '';
  if (isEditing) {
    html += iconButton('save', 'check', 'Save (MOD+Enter)');
    html += iconButton('cancel', 'close', 'Cancel (Esc)');
  } else if (isHighlighted) {
    html += iconButton('edit', 'edit', 'Edit (Enter)');
  }
  html += iconButton('menu', 'menu', 'Menu');
  return html;
}

export function menuDropdownTemplate(open, { headerColor, footerColor } = {}) {
  if (!open) return '';
  return `
    <div class="menu-item" data-action="open">Open&hellip;</div>
    <div class="menu-item" data-action="export">Export&hellip;</div>
    <div class="menu-color-row">
      <label class="menu-color-label">
        Header
        <input type="color" id="header-color-input" value="${headerColor}">
      </label>
      <label class="menu-color-label">
        Footer
        <input type="color" id="footer-color-input" value="${footerColor}">
      </label>
    </div>
  `;
}

// --- Sections ---

function sectionEditorTemplate(text) {
  return `<div class="section-editor" contenteditable="plaintext-only">${escapeHtml(text)}</div>`;
}

function sectionRenderedTemplate(html, isToken) {
  return `<div class="section-rendered">${
    isToken ? '<span class="placeholder-text">add section&hellip;</span>' : html
  }</div>`;
}

export function sectionTemplate({ index, isEditing, isHighlighted, isToken, text, html }) {
  const classes = ['section'];
  if (isEditing) classes.push('selected');
  if (isHighlighted) classes.push('highlighted');

  const content = isEditing
    ? sectionEditorTemplate(text)
    : sectionRenderedTemplate(html, isToken);

  return `
    <div class="${classes.join(' ')}" data-index="${index}">
      <div class="section-margin-left"></div>
      <div class="section-content">${content}</div>
      <div class="section-margin-right"></div>
    </div>
  `;
}
