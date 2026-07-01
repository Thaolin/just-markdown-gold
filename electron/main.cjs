const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

let mainWindow = null;
let pendingOpenPath = findOpenPath(process.argv);
let rendererHasUnsavedChanges = false;
let closeAllowed = false;
let closePromptActive = false;
let livePreviewEnabled = true;

const recoveryPath = path.join(app.getPath("userData"), "recovery-draft.md");

function buildRecentFilesMenu() {
  const recentDocs = app.getRecentDocuments();
  if (recentDocs.length === 0) {
    return [{ label: "No recent files", enabled: false }];
  }
  return recentDocs.slice(0, 10).map((filePath) => ({
    label: path.basename(filePath),
    tooltip: filePath,
    click: () => {
      if (mainWindow) mainWindow.webContents.send("menu:open-recent", filePath);
    },
  }));
}

function buildMenu() {
  const recentFilesSubmenu = buildRecentFilesMenu();

  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:new"); },
        },
        {
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:open"); },
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:save"); },
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:save-as"); },
        },
        { type: "separator" },
        {
          label: "Recent Files",
          submenu: recentFilesSubmenu,
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          role: "quit",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Redo", accelerator: "CmdOrCtrl+Y", role: "redo" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:find"); },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Live Preview",
          type: "checkbox",
          checked: livePreviewEnabled,
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:toggle-preview"); },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Just Markdown: Gold Edition",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About Just Markdown: Gold Edition",
              message: "Just Markdown: Gold Edition",
              detail: `Version ${app.getVersion()}\n\nA simple local Markdown editor for Windows.\nGold Edition, unfortunately.\n\nThe Markdown editor arms race is over. This one opens files.`,
              buttons: ["OK"],
              icon: path.join(__dirname, "..", "build", "icon.ico"),
            });
          },
        },
      ],
    },
  ]);
}

function refreshMenu() {
  const menu = buildMenu();
  Menu.setApplicationMenu(menu);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

function log(message, details) {
  try {
    const logPath = path.join(app.getPath("userData"), "markdown-editor.log");
    fsSync.mkdirSync(path.dirname(logPath), { recursive: true });

    if (!log.initialized) {
      const header = `\n${"=".repeat(52)}\n[${new Date().toISOString()}] SESSION START v${app.getVersion()}\n${"=".repeat(52)}\n`;
      fsSync.appendFileSync(logPath, header, "utf8");
      log.initialized = true;

      try {
        const stat = fsSync.statSync(logPath);
        if (stat.size > 2 * 1024 * 1024) {
          const lines = fsSync.readFileSync(logPath, "utf8").split("\n");
          fsSync.writeFileSync(logPath, lines.slice(-10000).join("\n") + "\n", "utf8");
        }
      } catch { /* best-effort trim */ }
    }

    const suffix = details == null ? "" : ` ${typeof details === "string" ? details : JSON.stringify(details)}`;
    fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}${suffix}\n`, "utf8");
  } catch {
    /* Logging must never break the editor. */
  }
}

log("boot", { platform: process.platform, userData: app.getPath("userData") });

process.on("uncaughtException", (error) => {
  log("main uncaughtException", { message: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason) => {
  log("main unhandledRejection", { reason: String(reason), stack: reason?.stack });
});

function isMarkdownPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".mdown" || ext === ".txt";
}

function findOpenPath(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith("-")) continue;
    const resolved = path.resolve(arg);
    if (isMarkdownPath(resolved)) return resolved;
  }
  return null;
}

function createWindow() {
  log("createWindow", { packaged: app.isPackaged, pendingOpenPath, argv: process.argv });

  refreshMenu();

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: "Just Markdown: Gold Edition",
    backgroundColor: "#15171b",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    log("loadFile", { indexPath });
    mainWindow.loadFile(indexPath);
  } else {
    log("loadURL", { url: "http://127.0.0.1:5173" });
    mainWindow.loadURL("http://127.0.0.1:5173");
  }

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log("renderer did-fail-load", { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("renderer render-process-gone", details);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const label = ["verbose", "info", "warn", "error"][level] ?? level;
    log(`renderer [${label}]`, { message, line, sourceId });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    rendererHasUnsavedChanges = false;
    closeAllowed = false;
    closePromptActive = false;
  });

  mainWindow.on("close", async (event) => {
    if (closeAllowed || !rendererHasUnsavedChanges) return;
    event.preventDefault();
    if (closePromptActive) return;
    closePromptActive = true;
    let waitForSaveBeforeClose = false;
    try {
      const action = await confirmUnsavedChanges();
      if (action === "save") {
        waitForSaveBeforeClose = true;
        mainWindow?.webContents.send("app:save-before-close");
        return;
      }
      if (action === "discard") {
        closeAllowed = true;
        mainWindow?.close();
      }
    } finally {
      if (!waitForSaveBeforeClose) closePromptActive = false;
    }
  });
}

app.whenReady().then(() => {
  log("app ready", { userData: app.getPath("userData") });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", (_event, argv) => {
  const nextPath = findOpenPath(argv);
  log("second-instance", { argv, nextPath });
  if (!mainWindow) {
    if (nextPath) pendingOpenPath = nextPath;
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  if (nextPath) mainWindow.webContents.send("file:open-request", nextPath);
});

ipcMain.handle("file:get-pending-open", () => {
  const filePath = pendingOpenPath;
  pendingOpenPath = null;
  log("file:get-pending-open", { filePath });
  return filePath;
});

ipcMain.handle("file:open-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("file:read", async (_event, filePath) => {
  log("file:read start", { filePath });
  try {
    const content = await fs.readFile(filePath, "utf8");
    log("file:read success", { filePath, chars: content.length });
    try { app.addRecentDocument(filePath); refreshMenu(); } catch { /* best-effort */ }
    return { filePath, content };
  } catch (error) {
    log("file:read error", { filePath, message: error.message, stack: error.stack });
    throw error;
  }
});

ipcMain.handle("file:save", async (_event, payload) => {
  await fs.writeFile(payload.filePath, payload.content ?? "", "utf8");
  try { fsSync.unlinkSync(recoveryPath); } catch { /* may not exist */ }
  return { filePath: payload.filePath };
});

ipcMain.handle("file:save-as", async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: payload.defaultPath ?? "untitled.md",
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "Text", extensions: ["txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, payload.content ?? "", "utf8");
  try { fsSync.unlinkSync(recoveryPath); } catch { /* may not exist */ }
  try { app.addRecentDocument(result.filePath); refreshMenu(); } catch { /* best-effort */ }
  return { filePath: result.filePath };
});

async function confirmUnsavedChanges(fileLabel = "this document") {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: "Unsaved changes",
    message: `Save changes to ${fileLabel}?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  if (result.response === 0) return "save";
  if (result.response === 1) return "discard";
  return "cancel";
}

ipcMain.handle("app:set-dirty", (_event, dirty) => {
  rendererHasUnsavedChanges = Boolean(dirty);
});

ipcMain.handle("app:confirm-unsaved", async (_event, fileLabel) => {
  return confirmUnsavedChanges(fileLabel);
});

ipcMain.handle("app:close-after-save", () => {
  rendererHasUnsavedChanges = false;
  closeAllowed = true;
  mainWindow?.close();
});

ipcMain.handle("app:cancel-close-after-save", () => {
  closePromptActive = false;
});

ipcMain.handle("menu:set-live-preview", (_event, enabled) => {
  livePreviewEnabled = Boolean(enabled);
  refreshMenu();
});

// ── Crash recovery draft ──
ipcMain.handle("app:save-recovery-draft", async (_event, content) => {
  try {
    await fs.writeFile(recoveryPath, content ?? "", "utf8");
    log("recovery saved", { chars: (content ?? "").length });
  } catch (e) {
    log("recovery save error", { message: e.message });
  }
});

ipcMain.handle("app:get-recovery-draft", async () => {
  try {
    const content = await fs.readFile(recoveryPath, "utf8");
    return content || null;
  } catch {
    return null;
  }
});

ipcMain.handle("app:clear-recovery-draft", () => {
  try { fsSync.unlinkSync(recoveryPath); } catch { /* may not exist */ }
});
