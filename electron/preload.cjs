const { contextBridge, ipcRenderer } = require("electron");

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
});
