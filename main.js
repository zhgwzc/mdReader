const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { readFileAuto } = require('./encoding');

app.setName('MD阅读器');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 500,
    title: 'MD 阅读器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  buildMenu();

  mainWindow.on('closed', () => { mainWindow = null; });
}

function updateTitle() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript('window.getActiveFilePath()').then((fp) => {
    const fname = fp ? path.basename(fp) : 'Untitled';
    mainWindow.webContents.executeJavaScript('window.getActiveIsModified()').then((mod) => {
      mainWindow.setTitle(`MD 阅读器 - ${fname}${mod ? ' *' : ''}`);
    });
  });
}

async function openFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || filePaths.length === 0) return;

  for (const filePath of filePaths) {
    const content = readFileAuto(filePath);
    const b64 = Buffer.from(content, 'utf-8').toString('base64');
    await mainWindow.webContents.executeJavaScript(
      `window.addTabFromMain("${filePath.replace(/\\/g, '\\\\')}", atob("${b64}"))`
    );
  }
  updateTitle();
}

async function saveFile() {
  const filePath = await mainWindow.webContents.executeJavaScript('window.getActiveFilePath()');
  const content = await mainWindow.webContents.executeJavaScript('window.getEditorContent()');

  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf-8');
    await mainWindow.webContents.executeJavaScript(`window.markActiveSaved("${filePath.replace(/\\/g, '\\\\')}")`);
    updateTitle();
    return true;
  }
  return await saveFileAs();
}

async function saveFileAs() {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return false;

  const content = await mainWindow.webContents.executeJavaScript('window.getEditorContent()');
  fs.writeFileSync(filePath, content, 'utf-8');
  await mainWindow.webContents.executeJavaScript(`window.markActiveSaved("${filePath.replace(/\\/g, '\\\\')}")`);
  updateTitle();
  return true;
}

// ========== IPC handlers ==========
ipcMain.handle('show-item-in-folder', async (_, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (err) {
    console.error('showItemInFolder error:', err);
    return false;
  }
});

ipcMain.handle('save-tab-content', async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('save-tab-content error:', err);
    return false;
  }
});

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New', accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.executeJavaScript("window.addTabFromMain(null, '')");
            updateTitle();
          },
        },
        {
          label: 'Open...', accelerator: 'CmdOrCtrl+O',
          click: () => openFile(),
        },
        { type: 'separator' },
        {
          label: 'Save', accelerator: 'CmdOrCtrl+S',
          click: () => saveFile(),
        },
        {
          label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S',
          click: () => saveFileAs(),
        },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFilePath(filePath);
});

function openFilePath(filePath) {
  if (!mainWindow) {
    app.once('browser-window-created', () => {
      setTimeout(() => openFilePath(filePath), 500);
    });
    return;
  }
  const content = readFileAuto(filePath);
  const b64 = Buffer.from(content, 'utf-8').toString('base64');
  mainWindow.webContents.executeJavaScript(
    `window.addTabFromMain("${filePath.replace(/\\/g, '\\\\')}", atob("${b64}"))`
  );
  updateTitle();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
