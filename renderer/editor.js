// ============================================================
//  ai_md — Multi-tab Markdown Editor
// ============================================================

const { basicSetup } = require('codemirror');
const { EditorView, keymap } = require('@codemirror/view');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { defaultKeymap, historyKeymap, history } = require('@codemirror/commands');
const markdownit = require('markdown-it');
const TurndownService = require('turndown');
const path = require('path');
const { webUtils, ipcRenderer } = require('electron');
const fs = require('fs');
const { readFileAuto } = require('../encoding');

const md = markdownit({ html: true, linkify: true, typographer: true, breaks: true });
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

const isMac = process.platform === 'darwin';
const revealLabel = isMac ? 'Show in Finder' : 'Show in Explorer';

// ========== State ==========
let tabs = [];
let activeTabId = null;
let isInternalUpdate = false;
let zoomLevel = 100;
let tabIdCounter = 0;
let currentView = 'preview';
let contextMenuTabId = null;
let outlineVisible = false;

// ========== Helpers ==========
function wrapSelection(wrapper) {
  return (view) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    if (from === to) {
      const ph = wrapper === '**' ? 'bold' : 'italic';
      view.dispatch({
        changes: { from, insert: wrapper + ph + wrapper },
        selection: { anchor: from + wrapper.length, head: from + wrapper.length + ph.length },
      });
    } else {
      view.dispatch({
        changes: [{ from: to, insert: wrapper }, { from: from, insert: wrapper }],
        selection: { anchor: from + wrapper.length, head: to + wrapper.length },
      });
    }
    return true;
  };
}

function insertLink(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const t = state.doc.sliceString(from, to) || 'link text';
  view.dispatch({
    changes: { from, to, insert: `[${t}](url)` },
    selection: { anchor: from + t.length + 3, head: from + t.length + 6 },
  });
  return true;
}

function prefixLine(prefix) {
  return (view) => {
    const line = view.state.doc.lineAt(view.state.selection.main.from);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    return true;
  };
}

// ========== Tab management ==========
function addTab(filePath, content) {
  // 已打开的文件直接切换，不重复创建标签
  if (filePath) {
    const existing = tabs.find(t => t.filePath === filePath);
    if (existing) { switchTab(existing.id); return existing; }
  }
  const id = ++tabIdCounter;

  const editorViews = document.getElementById('editor-views');
  const edDiv = document.createElement('div');
  edDiv.id = `editor-${id}`;
  edDiv.className = 'editor-container';
  editorViews.appendChild(edDiv);

  const previewViews = document.getElementById('preview-views');
  const pvDiv = document.createElement('div');
  pvDiv.id = `preview-${id}`;
  pvDiv.className = 'preview-container';
  const pvContent = document.createElement('div');
  pvContent.className = 'markdown-body';
  pvContent.contentEditable = 'true';
  pvDiv.appendChild(pvContent);
  previewViews.appendChild(pvDiv);

  const tab = {
    id, filePath, _content: content || '',
    editor: null, isModified: false,
    edDiv, pvDiv, pvContent,
  };

  tabs.push(tab);
  pvContent.innerHTML = md.render(content || '');
  addTabButton(tab);

  // 打开文件时默认 preview + 显示大纲
  if (filePath) {
    if (currentView !== 'preview') {
      currentView = 'preview';
      document.getElementById("btn-edit").classList.remove("active");
      document.getElementById("btn-preview").classList.add("active");
      document.getElementById("btn-outline").style.display = "";
    }
    if (!outlineVisible) {
      outlineVisible = true;
      document.getElementById("outline-sidebar").classList.add("visible");
      document.getElementById("btn-outline").classList.add("active");
      document.getElementById("content-area").classList.add("outline-open");
    }
  }

  switchTab(id);

  return tab;
}

function createEditorForTab(tab) {
  tab.edDiv.innerHTML = '';

  const editor = new EditorView({
    state: EditorState.create({
      doc: tab._content || '',
      extensions: [
        basicSetup,
        markdown(),
        keymap.of([
          { key: 'Mod-b', run: wrapSelection('**') },
          { key: 'Mod-i', run: wrapSelection('_') },
          { key: 'Mod-k', run: insertLink },
          { key: 'Mod-l', run: prefixLine('- ') },
        ]),
        keymap.of(defaultKeymap),
        keymap.of(historyKeymap),
        history(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            tab.isModified = true;
            updateTabTitle(tab);
            syncPreviewForTab(tab);
          }
        }),
        EditorView.theme({
          '&': { backgroundColor: '#fff', color: '#333' },
          '.cm-content': { caretColor: '#000' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#000' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#b3d4fc' },
          '.cm-activeLine': { backgroundColor: '#f0f0f0' },
          '.cm-gutters': { backgroundColor: '#fafafa', color: '#999', borderRight: '1px solid #e0e0e0' },
        }),
      ],
    }),
    parent: tab.edDiv,
  });

  tab.editor = editor;
  return editor;
}

function addTabButton(tab) {
  const tabsEl = document.getElementById('tabs');
  const btn = document.createElement('div');
  btn.className = 'tab';
  btn.dataset.tabId = tab.id;
  btn.innerHTML = `
    <span class="tab-title">${getTabName(tab)}</span>
    <span class="tab-close" data-action="close">&times;</span>
  `;
  btn.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'close') {
      e.stopPropagation();
      closeTab(tab.id);
    } else {
      switchTab(tab.id);
    }
  });
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, tab.id);
  });
  tab._btn = btn;
  tabsEl.appendChild(btn);
}

function getTabName(tab) {
  return tab.filePath ? path.basename(tab.filePath) : 'Untitled';
}

function updateTabTitle(tab) {
  if (!tab._btn) return;
  const name = getTabName(tab);
  tab._btn.querySelector('.tab-title').textContent = tab.isModified ? name + ' *' : name;
}

function switchTab(id) {
  tabs.forEach(t => {
    if (t._btn) t._btn.classList.remove('active');
    if (t.edDiv) t.edDiv.classList.remove('active');
    if (t.pvDiv) t.pvDiv.classList.remove('active');
  });

  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  activeTabId = id;

  // 空内容标签强制切到编辑模式，避免空 preview 无法交互
  const hasContent = (tab.editor && tab.editor.state.doc.toString().trim() !== '') || (tab._content && tab._content.trim() !== '');
  if (!hasContent && currentView === 'preview') {
    showView('edit');
  }

  if (outlineVisible) rebuildOutline();
  if (tab._btn) tab._btn.classList.add('active');
  showViewInternal(currentView, tab);

  if (!tab.editor) {
    createEditorForTab(tab);
  }

  if (currentView === 'edit' && tab.editor) {
    setTimeout(() => tab.editor.focus(), 0);
  }
}

function showConfirmDialog(tabName) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-dialog');
    document.getElementById('confirm-message').textContent = `是否保存对"${tabName}"的修改？`;

    const onDontSave = () => { cleanup(); resolve('dontsave'); };
    const onCancel = () => { cleanup(); resolve('cancel'); };
    const onSave = () => { cleanup(); resolve('save'); };

    function cleanup() {
      overlay.style.display = 'none';
      document.getElementById('btn-dont-save').removeEventListener('click', onDontSave);
      document.getElementById('btn-cancel-confirm').removeEventListener('click', onCancel);
      document.getElementById('btn-save-confirm').removeEventListener('click', onSave);
    }

    document.getElementById('btn-dont-save').addEventListener('click', onDontSave);
    document.getElementById('btn-cancel-confirm').addEventListener('click', onCancel);
    document.getElementById('btn-save-confirm').addEventListener('click', onSave);

    overlay.style.display = 'flex';
  });
}

async function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  if (tab.isModified) {
    const result = await showConfirmDialog(getTabName(tab));
    if (result === 'cancel') return;
    if (result === 'save') {
      if (tab.filePath && tab.editor) {
        const content = tab.editor.state.doc.toString();
        await ipcRenderer.invoke('save-tab-content', tab.filePath, content);
        tab.isModified = false;
      }
      // 无 filePath 时无法保存，继续关闭（等同不保存）
    }
  }

  if (tab.edDiv) tab.edDiv.remove();
  if (tab.pvDiv) tab.pvDiv.remove();
  if (tab._btn) tab._btn.remove();
  if (tab.editor) tab.editor.destroy();

  tabs.splice(idx, 1);

  if (tabs.length > 0) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    activeTabId = null;
    addTab(null, '');
  }
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

// ========== Context menu ==========
function showContextMenu(x, y, tabId) {
  contextMenuTabId = tabId;
  const menu = document.getElementById('tab-context-menu');
  menu.querySelector('[data-action="reveal"]').textContent = revealLabel;

  const tab = tabs.find(t => t.id === tabId);
  const saveItem = menu.querySelector('[data-action="save"]');
  const revealItem = menu.querySelector('[data-action="reveal"]');
  if (tab) {
    saveItem.style.display = tab.isModified ? '' : 'none';
    revealItem.style.display = tab.filePath ? '' : 'none';
  }

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';
}

function hideContextMenu() {
  document.getElementById('tab-context-menu').style.display = 'none';
  contextMenuTabId = null;
}

async function handleContextAction(action) {
  const tab = tabs.find(t => t.id === contextMenuTabId);
  if (!tab) return;

  switch (action) {
    case 'close':
      closeTab(contextMenuTabId);
      break;
    case 'save':
      if (tab.filePath && tab.editor) {
        const content = tab.editor.state.doc.toString();
        // Save via IPC to main process (writes to file)
        await ipcRenderer.invoke('save-tab-content', tab.filePath, content);
        tab.isModified = false;
        updateTabTitle(tab);
      }
      break;
    case 'reveal':
      if (tab.filePath) {
        // Use IPC to call shell.showItemInFolder in main process
        await ipcRenderer.invoke('show-item-in-folder', tab.filePath);
      }
      break;
  }
  hideContextMenu();
}

// ========== Outline ==========
function rebuildOutline() {
  const sidebar = document.getElementById("outline-sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = "";
  const tab = getActiveTab();
  if (!tab || !tab.pvContent) return;
  const headings = tab.pvContent.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((h, idx) => {
    const id = h.id || ("outline-" + idx);
    if (!h.id) h.id = id;
    const item = document.createElement("div");
    item.className = "outline-item outline-" + h.tagName.toLowerCase();
    item.textContent = h.textContent;
    item.addEventListener("click", () => {
      h.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll(".outline-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
    });
    sidebar.appendChild(item);
  });
}

// ========== Preview sync ==========
function syncPreviewForTab(tab) {
  if (isInternalUpdate) return;
  if (!tab.editor) return;
  tab.pvContent.innerHTML = md.render(tab.editor.state.doc.toString());
  if (outlineVisible) rebuildOutline();
}

function saveScrollRatio(tab) {
  if (!tab) return 0;
  if (tab.pvDiv && tab.pvDiv.classList.contains('active')) {
    const maxScroll = tab.pvDiv.scrollHeight - tab.pvDiv.clientHeight;
    return maxScroll > 0 ? tab.pvDiv.scrollTop / maxScroll : 0;
  }
  if (tab.editor) {
    const es = tab.editor.scrollDOM;
    const maxScroll = es.scrollHeight - es.clientHeight;
    return maxScroll > 0 ? es.scrollTop / maxScroll : 0;
  }
  return 0;
}

function syncFromPreview() {
  if (isInternalUpdate) return;
  const tab = getActiveTab();
  if (!tab || !tab.pvContent) return;

  const html = tab.pvContent.innerHTML;
  const mdText = turndown.turndown(html);

  isInternalUpdate = true;
  tab.editor.dispatch({
    changes: { from: 0, to: tab.editor.state.doc.length, insert: mdText },
  });
  isInternalUpdate = false;
}

// ========== View toggle ==========
function showViewInternal(viewName, tab) {
  if (viewName === 'edit') {
    if (tab.edDiv) tab.edDiv.classList.add('active');
    if (tab.pvDiv) tab.pvDiv.classList.remove('active');
  } else {
    if (tab.editor) {
      tab.pvContent.innerHTML = md.render(tab.editor.state.doc.toString());
  if (outlineVisible) rebuildOutline();
    }
    if (tab.edDiv) tab.edDiv.classList.remove('active');
    if (tab.pvDiv) tab.pvDiv.classList.add('active');
  }
}

function showView(viewName) {
  const tab = getActiveTab();
  const scrollRatio = saveScrollRatio(tab);

  currentView = viewName;
  document.getElementById("btn-edit").classList.toggle("active", viewName === "edit");
  document.getElementById("btn-preview").classList.toggle("active", viewName === "preview");
  const btnOutline = document.getElementById("btn-outline");
  const outlineSidebar = document.getElementById("outline-sidebar");
  const contentArea = document.getElementById("content-area");
  if (viewName === "preview") {
    btnOutline.style.display = "";
    if (outlineVisible) {
      outlineSidebar.classList.add("visible");
      btnOutline.classList.add("active");
      contentArea.classList.add("outline-open");
      rebuildOutline();
    }
  } else {
    btnOutline.style.display = "none";
    outlineSidebar.classList.remove("visible");
    btnOutline.classList.remove("active");
    contentArea.classList.remove("outline-open");
  }
  if (tab) {
    showViewInternal(viewName, tab);
    requestAnimationFrame(() => {
      if (viewName === 'edit' && tab.editor) {
        const es = tab.editor.scrollDOM;
        const maxScroll = es.scrollHeight - es.clientHeight;
        es.scrollTop = scrollRatio * maxScroll;
        tab.editor.focus();
      } else if (viewName === 'preview' && tab.pvDiv) {
        const maxScroll = tab.pvDiv.scrollHeight - tab.pvDiv.clientHeight;
        tab.pvDiv.scrollTop = scrollRatio * maxScroll;
      }
    });
  }
}

// ========== Preview Enter in code blocks ==========
document.addEventListener('keydown', (e) => {
  const tab = getActiveTab();
  if (!tab || !tab.pvContent) return;
  if (!tab.pvDiv.classList.contains('active')) return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let node = sel.anchorNode;
  while (node && node !== tab.pvContent) {
    if (node.nodeName === 'PRE') {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
      }
      return;
    }
    node = node.parentNode;
  }
});

// ========== Zoom ==========
function applyZoom() {
  const scale = zoomLevel / 100;
  document.querySelectorAll('.cm-content').forEach(el => {
    el.style.fontSize = (15 * scale) + 'px';
  });
  document.querySelectorAll('.markdown-body').forEach(el => {
    el.style.fontSize = (16 * scale) + 'px';
  });
  document.getElementById('zoom-label').textContent = zoomLevel + '%';
}

function zoomIn() { zoomLevel = Math.min(200, zoomLevel + 10); applyZoom(); }
function zoomOut() { zoomLevel = Math.max(50, zoomLevel - 10); applyZoom(); }
function zoomReset() { zoomLevel = 100; applyZoom(); }

// ========== Exposed for main process ==========
window.getEditorContent = () => {
  const tab = getActiveTab();
  return tab && tab.editor ? tab.editor.state.doc.toString() : '';
};

window.addTabFromMain = (filePath, content) => {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
  content = new TextDecoder("utf-8").decode(bytes);
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) { switchTab(existing.id); return; }
  addTab(filePath, content);
};

window.getActiveFilePath = () => {
  const tab = getActiveTab();
  return tab ? tab.filePath : null;
};

window.getActiveIsModified = () => {
  const tab = getActiveTab();
  return tab ? tab.isModified : false;
};

window.markActiveSaved = (filePath) => {
  const tab = getActiveTab();
  if (tab) {
    tab.isModified = false;
    if (filePath) tab.filePath = filePath;
    updateTabTitle(tab);
  }
};

// ========== Drag & drop ==========
// 捕获阶段拦截，防止 contentEditable 预览区先处理 drop 导致内容被插入当前文档
document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
document.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation();
  const files = e.dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.name.endsWith('.md')) continue;
    const filePath = webUtils.getPathForFile(file);
    const content = readFileAuto(filePath);
    addTab(filePath, content);
  }
}, true);

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-edit').addEventListener('click', () => showView('edit'));
  document.getElementById('btn-preview').addEventListener('click', () => showView('preview'));
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
  document.getElementById('btn-zoom-reset').addEventListener('click', zoomReset);
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);

  document.getElementById('preview-views').addEventListener('input', (e) => {
    if (e.target.classList.contains('markdown-body')) syncFromPreview();
  });

  document.querySelectorAll('#tab-context-menu .context-item').forEach(item => {
    item.addEventListener('click', () => handleContextAction(item.dataset.action));
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tab-context-menu')) hideContextMenu();
  });

  // ========== Outline ==========
  const outlineSidebar = document.getElementById("outline-sidebar");
  const btnOutline = document.getElementById("btn-outline");
  btnOutline.style.display = "none";

  const contentArea = document.getElementById("content-area");

  btnOutline.addEventListener("click", () => {
    outlineVisible = !outlineVisible;
    if (outlineVisible) {
      outlineSidebar.classList.add("visible");
      btnOutline.classList.add("active");
      contentArea.classList.add("outline-open");
      rebuildOutline();
    } else {
      outlineSidebar.classList.remove("visible");
      btnOutline.classList.remove("active");
      contentArea.classList.remove("outline-open");
    }
  });

  addTab(null, '');
});
