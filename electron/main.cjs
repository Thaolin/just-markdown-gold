const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

let mainWindow = null;
let pendingOpenPath = findOpenPath(process.argv);
let rendererHasUnsavedChanges = false;
let closeAllowed = false;
let closePromptActive = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

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
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: "Markdown Editor",
    backgroundColor: "#15171b",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://127.0.0.1:5173");
  }

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
  const content = await fs.readFile(filePath, "utf8");
  return { filePath, content };
});

ipcMain.handle("file:save", async (_event, payload) => {
  await fs.writeFile(payload.filePath, payload.content ?? "", "utf8");
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
