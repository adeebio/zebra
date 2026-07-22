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
    </header>

    <div class="doc-spacer-top"></div>
    <main class="document-container">
      <div id="document-sections" class="document-sections"></div>
    </main>
    <div class="doc-spacer-bottom"></div>

    <main class="start-menu" id="start-menu">${startMenuTemplate()}</main>

    <footer class="editor-footer"></footer>
  `;
}

// --- Start menu (06.jpg — opened from the header; replaces the old dropdown) ---

function startMenuTemplate() {
  return `
    <div class="start-menu-inner">
      <button class="start-menu-btn" data-action="create-new">Create new document</button>
      <button class="start-menu-btn" data-action="open">Open document&hellip;</button>
      <button class="start-menu-btn" data-action="export">Export&hellip;</button>

      <section class="start-menu-panel">
        <h2 class="start-menu-panel-title">About</h2>
        <div class="start-menu-panel-body">
          <p>Zebra is a simple, minimal markdown editor. A document is a stack of
          sections &mdash; each begins with a heading &mdash; that you highlight and
          edit one at a time.</p>
        </div>
      </section>

      <section class="start-menu-panel">
        <h2 class="start-menu-panel-title">Keyboard shortcuts</h2>
        <div class="start-menu-panel-body">
          <dl class="shortcut-list">
            <div class="shortcut"><dt>&uarr; / &darr;</dt><dd>Highlight the nearest section, then move the highlight up or down</dd></div>
            <div class="shortcut"><dt>Enter</dt><dd>Edit the highlighted section</dd></div>
            <div class="shortcut"><dt>Esc</dt><dd>Stop editing, or clear the highlight</dd></div>
            <div class="shortcut"><dt>Mod + Enter</dt><dd>Save changes (Mod is &#8984; on macOS, Ctrl elsewhere)</dd></div>
          </dl>
        </div>
      </section>
    </div>
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
  html += iconButton('menu', 'menu', 'Start menu');
  return html;
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
