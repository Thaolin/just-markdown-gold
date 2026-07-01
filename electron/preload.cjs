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
  onOpenRequest: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on("file:open-request", listener);
    return () => ipcRenderer.removeListener("file:open-request", listener);
  },
  onSaveBeforeClose: (callback) => {
    ipcRenderer.on("app:save-before-close", callback);
    return () => ipcRenderer.removeListener("app:save-before-close", callback);
  },
  onMenuNew: (callback) => {
    ipcRenderer.on("menu:new", callback);
    return () => ipcRenderer.removeListener("menu:new", callback);
  },
  onMenuOpen: (callback) => {
    ipcRenderer.on("menu:open", callback);
    return () => ipcRenderer.removeListener("menu:open", callback);
  },
  onMenuSave: (callback) => {
    ipcRenderer.on("menu:save", callback);
    return () => ipcRenderer.removeListener("menu:save", callback);
  },
  onMenuSaveAs: (callback) => {
    ipcRenderer.on("menu:save-as", callback);
    return () => ipcRenderer.removeListener("menu:save-as", callback);
  },
  onMenuTogglePreview: (callback) => {
    ipcRenderer.on("menu:toggle-preview", callback);
    return () => ipcRenderer.removeListener("menu:toggle-preview", callback);
  },
  onMenuFind: (callback) => {
    ipcRenderer.on("menu:find", callback);
    return () => ipcRenderer.removeListener("menu:find", callback);
  },
  onMenuOpenRecent: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on("menu:open-recent", listener);
    return () => ipcRenderer.removeListener("menu:open-recent", listener);
  },
  setLivePreview: (enabled) => ipcRenderer.invoke("menu:set-live-preview", enabled),

  // Crash recovery draft
  saveRecoveryDraft: (content) => ipcRenderer.invoke("app:save-recovery-draft", content),
  getRecoveryDraft: () => ipcRenderer.invoke("app:get-recovery-draft"),
  clearRecoveryDraft: () => ipcRenderer.invoke("app:clear-recovery-draft"),
});
