const { contextBridge, ipcRenderer } = require("electron");

function sendRendererLog(level, message, extra = {}) {
  ipcRenderer.send("app:renderer-log", { level, message, ...extra });
}

window.addEventListener("error", (event) => {
  sendRendererLog("error", event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  sendRendererLog("error", "Unhandled promise rejection", {
    reason: String(event.reason),
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
  log: (level, message, extra) => sendRendererLog(level, message, extra),
  onOpenRequest: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on("file:open-request", listener);
    return () => ipcRenderer.removeListener("file:open-request", listener);
  },
  onSaveBeforeClose: (callback) => {
    ipcRenderer.on("app:save-before-close", callback);
    return () => ipcRenderer.removeListener("app:save-before-close", callback);
  },
});
