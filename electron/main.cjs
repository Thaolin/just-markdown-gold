const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic } = require("./fileOps.cjs");

let mainWindow = null;
let pendingOpenPaths = findOpenPaths(process.argv);
let rendererReady = false;
let rendererHasUnsavedChanges = false;
let dirtyDocumentCount = 0;
let closeAllowed = false;
let closePromptActive = false;
let livePreviewEnabled = true;
let editorFontSize = "default";
let editorReadingWidth = "standard";
let editorTheme = "gold";

const themePreferences = [
  ["gold", "Gold Standard"],
  ["midnight", "Midnight"],
  ["evergreen", "Evergreen"],
  ["paper", "Paper"],
  ["power-user", "Power User"],
];
const fontSizePreferences = [
  ["smaller", "Smaller"],
  ["default", "Default"],
  ["larger", "Larger"],
];
const readingWidthPreferences = [
  ["narrow", "Narrow"],
  ["standard", "Standard"],
  ["wide", "Wide"],
];

const recoveryPath = path.join(app.getPath("userData"), "recovery-drafts.json");
const legacyRecoveryPath = path.join(app.getPath("userData"), "recovery-draft.md");
const recentFilesPath = path.join(app.getPath("userData"), "recent-files.json");
let recoveryOperation = Promise.resolve();
let recoveryWritesDisabled = false;

function queueRecoveryOperation(operation) {
  const next = recoveryOperation.catch(() => undefined).then(operation);
  recoveryOperation = next;
  return next;
}

async function clearRecoveryDrafts() {
  await Promise.all([
    fs.unlink(recoveryPath).catch((error) => { if (error.code !== "ENOENT") throw error; }),
    fs.unlink(legacyRecoveryPath).catch((error) => { if (error.code !== "ENOENT") throw error; }),
  ]);
}

async function clearRecoveryForClose() {
  recoveryWritesDisabled = true;
  try {
    await queueRecoveryOperation(clearRecoveryDrafts);
    return true;
  } catch (error) {
    recoveryWritesDisabled = false;
    log("recovery clear before close error", { message: error.message });
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Recovery draft could not be cleared",
      message: "The window is staying open so an old recovery draft cannot return unexpectedly.",
      detail: error.message,
      buttons: ["OK"],
    });
    return false;
  }
}

function canonicalFilePath(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return fsSync.realpathSync.native(resolved);
  } catch {
    try {
      return path.join(fsSync.realpathSync.native(path.dirname(resolved)), path.basename(resolved));
    } catch {
      return resolved;
    }
  }
}

function normalizeRecentKey(filePath) {
  const canonicalPath = canonicalFilePath(filePath);
  return process.platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
}

function readRecentFiles() {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(recentFilesPath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const files = [];
    for (const item of parsed) {
      if (typeof item !== "string" || !isMarkdownPath(item) || !fsSync.existsSync(item)) continue;
      const resolved = canonicalFilePath(item);
      const key = normalizeRecentKey(resolved);
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(resolved);
      if (files.length >= 10) break;
    }
    return files;
  } catch {
    return [];
  }
}

function writeRecentFiles(filePaths) {
  try {
    fsSync.mkdirSync(path.dirname(recentFilesPath), { recursive: true });
    fsSync.writeFileSync(recentFilesPath, JSON.stringify(filePaths, null, 2), "utf8");
  } catch (error) {
    log("recent files write error", { message: error.message });
  }
}

function rememberRecentFile(filePath) {
  if (!isMarkdownPath(filePath)) return;
  const resolved = canonicalFilePath(filePath);
  if (!fsSync.existsSync(resolved)) return;
  const key = normalizeRecentKey(resolved);
  const rest = readRecentFiles().filter((recentPath) => normalizeRecentKey(recentPath) !== key);
  const next = [resolved, ...rest].slice(0, 10);
  writeRecentFiles(next);
}

function clearRecentFiles() {
  try { fsSync.unlinkSync(recentFilesPath); } catch { /* may not exist */ }
  try { app.clearRecentDocuments(); } catch { /* best-effort */ }
  refreshMenu();
}

function buildRecentFilesMenu() {
  const recentDocs = readRecentFiles();
  if (recentDocs.length === 0) {
    return [{ label: "No recent files", enabled: false }];
  }
  return [
    ...recentDocs.slice(0, 10).map((filePath) => ({
      label: path.basename(filePath),
      tooltip: filePath,
      click: () => {
        dispatchOpenPaths([filePath]);
      },
    })),
    { type: "separator" },
    {
      label: "Clear Recent Files",
      click: clearRecentFiles,
    },
  ];
}

function hasPreference(options, value) {
  return options.some(([option]) => option === value);
}

function radioPreferenceItems(options, currentValue, applyValue, channel) {
  return options.map(([value, label]) => ({
    label,
    type: "radio",
    checked: currentValue === value,
    click: () => {
      applyValue(value);
      refreshMenu();
      if (mainWindow) mainWindow.webContents.send(channel, value);
    },
  }));
}

function setEditorPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") {
    log("invalid editor preferences payload", { preferences });
    return;
  }
  if (!hasPreference(fontSizePreferences, preferences.fontSize)) {
    log("invalid editor preferences font size", { fontSize: preferences.fontSize });
    return;
  }
  if (!hasPreference(readingWidthPreferences, preferences.readingWidth)) {
    log("invalid editor preferences reading width", { readingWidth: preferences.readingWidth });
    return;
  }
  if (!hasPreference(themePreferences, preferences.theme)) {
    log("invalid editor preferences theme", { theme: preferences.theme });
    return;
  }
  editorFontSize = preferences.fontSize;
  editorReadingWidth = preferences.readingWidth;
  editorTheme = preferences.theme;
  refreshMenu();
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
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu:close-tab"); },
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
        { label: "Redo", role: "redo" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "CmdOrCtrl+F",
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
        { type: "separator" },
        {
          label: "Theme",
          submenu: radioPreferenceItems(themePreferences, editorTheme, (value) => { editorTheme = value; }, "menu:set-theme"),
        },
        {
          label: "Font Size",
          submenu: radioPreferenceItems(fontSizePreferences, editorFontSize, (value) => { editorFontSize = value; }, "menu:set-font-size"),
        },
        {
          label: "Reading Width",
          submenu: radioPreferenceItems(readingWidthPreferences, editorReadingWidth, (value) => { editorReadingWidth = value; }, "menu:set-reading-width"),
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

function uniqueOpenPaths(filePaths) {
  const seen = new Set();
  const paths = [];
  for (const filePath of filePaths) {
    if (typeof filePath !== "string" || !isMarkdownPath(filePath)) continue;
    const resolved = canonicalFilePath(filePath);
    const key = normalizeRecentKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(resolved);
  }
  return paths;
}

function findOpenPaths(argv) {
  return uniqueOpenPaths(argv.slice(1).filter((arg) => arg && !arg.startsWith("-")));
}

function addPendingOpenPaths(filePaths) {
  const seen = new Set(pendingOpenPaths.map(normalizeRecentKey));
  for (const filePath of uniqueOpenPaths(filePaths)) {
    const key = normalizeRecentKey(filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    pendingOpenPaths.push(filePath);
  }
}

function dispatchOpenPaths(filePaths) {
  const paths = uniqueOpenPaths(filePaths);
  if (paths.length === 0) return;
  if (!mainWindow || !rendererReady) {
    addPendingOpenPaths(paths);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  for (const filePath of paths) {
    mainWindow.webContents.send("file:open-request", filePath);
  }
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const paths = uniqueOpenPaths([filePath]);
  log("open-file", { filePath, paths });
  if (paths.length === 0) return;
  if (!mainWindow && app.isReady()) {
    addPendingOpenPaths(paths);
    createWindow();
    return;
  }
  dispatchOpenPaths(paths);
});

function requireFilePath(filePath, name = "file path") {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return filePath;
}

function requireContent(content) {
  if (content == null) return "";
  if (typeof content !== "string") throw new TypeError("content must be a string");
  return content;
}

function requireOpenPaths(openPaths) {
  if (openPaths == null) return [];
  if (!Array.isArray(openPaths)) throw new TypeError("open paths must be an array");
  return openPaths.map((openPath) => requireFilePath(openPath, "open path"));
}

function requireSavePayload(payload, { requirePath } = { requirePath: true }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("save payload must be an object");
  }
  const content = requireContent(payload.content);
  const defaultPath = payload.defaultPath;
  if (defaultPath != null && typeof defaultPath !== "string") {
    throw new TypeError("default path must be a string");
  }
  return {
    content,
    defaultPath,
    openPaths: requireOpenPaths(payload.openPaths),
    ...(requirePath ? { filePath: requireFilePath(payload.filePath) } : {}),
  };
}

function createWindow() {
  log("createWindow", { packaged: app.isPackaged, pendingOpenPaths, argv: process.argv });

  refreshMenu();
  rendererReady = false;
  recoveryWritesDisabled = false;

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
    rendererReady = false;
    rendererHasUnsavedChanges = false;
    dirtyDocumentCount = 0;
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
      const action = await confirmUnsavedChanges(
        dirtyDocumentCount > 1 ? `${dirtyDocumentCount} documents` : "this document"
      );
      if (action === "save") {
        waitForSaveBeforeClose = true;
        mainWindow?.webContents.send("app:save-before-close");
        return;
      }
      if (action === "discard") {
        if (!(await clearRecoveryForClose())) return;
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
  const paths = findOpenPaths(argv);
  log("second-instance", { argv, paths });
  if (!mainWindow) {
    addPendingOpenPaths(paths);
    createWindow();
    return;
  }
  dispatchOpenPaths(paths);
});

ipcMain.handle("file:get-pending-open", () => {
  const filePaths = pendingOpenPaths;
  pendingOpenPaths = [];
  rendererReady = true;
  log("file:get-pending-open", { filePaths });
  return filePaths;
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
  filePath = canonicalFilePath(requireFilePath(filePath));
  log("file:read start", { filePath });
  try {
    const content = await fs.readFile(filePath, "utf8");
    log("file:read success", { filePath, chars: content.length });
    rememberRecentFile(filePath);
    try { app.addRecentDocument(filePath); } catch { /* best-effort */ }
    refreshMenu();
    return { filePath, content };
  } catch (error) {
    log("file:read error", { filePath, message: error.message, stack: error.stack });
    throw error;
  }
});

ipcMain.handle("file:save", async (_event, payload) => {
  const { filePath, content } = requireSavePayload(payload);
  const savedPath = await writeFileAtomic(filePath, content);
  rememberRecentFile(savedPath);
  try { app.addRecentDocument(savedPath); } catch { /* best-effort */ }
  refreshMenu();
  return { filePath: savedPath };
});

ipcMain.handle("file:save-as", async (_event, payload) => {
  const { defaultPath, content, openPaths } = requireSavePayload(payload, { requirePath: false });
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath ?? "untitled.md",
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "Text", extensions: ["txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  const selectedPath = canonicalFilePath(result.filePath);
  if (openPaths.some((openPath) => normalizeRecentKey(openPath) === normalizeRecentKey(selectedPath))) {
    throw new Error("The selected file is already open.");
  }
  const savedPath = await writeFileAtomic(selectedPath, content);
  rememberRecentFile(savedPath);
  try { app.addRecentDocument(savedPath); } catch { /* best-effort */ }
  refreshMenu();
  return { filePath: savedPath };
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

ipcMain.handle("app:set-dirty", (_event, state) => {
  if (state && typeof state === "object") {
    rendererHasUnsavedChanges = Boolean(state.dirty);
    dirtyDocumentCount = rendererHasUnsavedChanges && Number.isInteger(state.count) && state.count > 0
      ? state.count
      : rendererHasUnsavedChanges ? 1 : 0;
    return;
  }
  rendererHasUnsavedChanges = Boolean(state);
  dirtyDocumentCount = rendererHasUnsavedChanges ? 1 : 0;
});

ipcMain.handle("app:confirm-unsaved", async (_event, fileLabel) => {
  return confirmUnsavedChanges(fileLabel);
});

ipcMain.handle("app:close-after-save", async () => {
  if (!(await clearRecoveryForClose())) {
    closePromptActive = false;
    return false;
  }
  rendererHasUnsavedChanges = false;
  dirtyDocumentCount = 0;
  closeAllowed = true;
  mainWindow?.close();
  return true;
});

ipcMain.handle("app:cancel-close-after-save", () => {
  closePromptActive = false;
});

ipcMain.handle("menu:set-live-preview", (_event, enabled) => {
  livePreviewEnabled = Boolean(enabled);
  refreshMenu();
});

ipcMain.handle("menu:set-editor-preferences", (_event, preferences) => {
  setEditorPreferences(preferences);
});

// ── Crash recovery draft ──
ipcMain.handle("app:save-recovery-draft", (_event, content) => {
  content = requireContent(content);
  if (recoveryWritesDisabled) return;
  return queueRecoveryOperation(async () => {
    if (recoveryWritesDisabled) return;
    try {
      await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
      await writeFileAtomic(recoveryPath, content);
      log("recovery saved", { chars: content.length });
    } catch (error) {
      log("recovery save error", { message: error.message });
      throw error;
    }
  });
});

ipcMain.handle("app:get-recovery-draft", async () => {
  let content;
  try {
    content = await fs.readFile(recoveryPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      content = await fs.readFile(legacyRecoveryPath, "utf8");
    } catch (legacyError) {
      if (legacyError.code !== "ENOENT") throw legacyError;
      return null;
    }
  }
  return content;
});

ipcMain.handle("app:clear-recovery-draft", () => queueRecoveryOperation(clearRecoveryDrafts));
