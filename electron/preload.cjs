const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.message, {
    filename: event.filename, lineno: event.lineno, colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", String(event.reason), {
    stack: event.reason?.stack,
  });
});

function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("markdownFiles", {
  getPendingOpen: () => ipcRenderer.invoke("file:get-pending-open"),
  openDialog: () => ipcRenderer.invoke("file:open-dialog"),
  read: (filePath) => ipcRenderer.invoke("file:read", filePath),
  save: (payload) => ipcRenderer.invoke("file:save", payload),
  saveAs: (payload) => ipcRenderer.invoke("file:save-as", payload),
  setDirty: (dirty) => ipcRenderer.invoke("app:set-dirty", dirty),
  confirmUnsaved: (fileLabel) => ipcRenderer.invoke("app:confirm-unsaved", fileLabel),
  closeAfterSave: () => ipcRenderer.invoke("app:close-after-save"),
  cancelCloseAfterSave: () => ipcRenderer.invoke("app:cancel-close-after-save"),
  onOpenRequest: (callback) => subscribe("file:open-request", callback),
  onSaveBeforeClose: (callback) => subscribe("app:save-before-close", callback),
  onMenuNew: (callback) => subscribe("menu:new", callback),
  onMenuOpen: (callback) => subscribe("menu:open", callback),
  onMenuSave: (callback) => subscribe("menu:save", callback),
  onMenuSaveAs: (callback) => subscribe("menu:save-as", callback),
  onMenuTogglePreview: (callback) => subscribe("menu:toggle-preview", callback),
  onMenuFontSize: (callback) => subscribe("menu:set-font-size", callback),
  onMenuReadingWidth: (callback) => subscribe("menu:set-reading-width", callback),
  onMenuTheme: (callback) => subscribe("menu:set-theme", callback),
  onMenuFind: (callback) => subscribe("menu:find", callback),
  onMenuOpenRecent: (callback) => subscribe("menu:open-recent", callback),
  setLivePreview: (enabled) => ipcRenderer.invoke("menu:set-live-preview", enabled),
  setEditorPreferences: (preferences) => ipcRenderer.invoke("menu:set-editor-preferences", preferences),

  // Crash recovery draft
  saveRecoveryDraft: (content) => ipcRenderer.invoke("app:save-recovery-draft", content),
  getRecoveryDraft: () => ipcRenderer.invoke("app:get-recovery-draft"),
  clearRecoveryDraft: () => ipcRenderer.invoke("app:clear-recovery-draft"),
});
