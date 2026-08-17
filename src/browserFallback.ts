const FALLBACK_PATH = "Browser draft.md";
const FALLBACK_KEY = "markdown-editor.browser-draft";

export function installBrowserFallback(): void {
  if (window.markdownFiles) return;

  window.markdownFiles = {
    platform: "browser",
    getPendingOpen: async () => [],
    openDialog: async () => null,
    read: async (filePath) => ({
      filePath,
      content: localStorage.getItem(FALLBACK_KEY) ?? "# Browser smoke test\n\n",
    }),
    save: async ({ filePath, content }) => {
      localStorage.setItem(FALLBACK_KEY, content);
      return { filePath };
    },
    saveAs: async ({ content }) => {
      localStorage.setItem(FALLBACK_KEY, content);
      return { filePath: FALLBACK_PATH };
    },
    setDirty: async () => undefined,
    confirmUnsaved: async (fileLabel) => (window.confirm(`Discard unsaved changes to ${fileLabel}?`) ? "discard" : "cancel"),
    closeAfterSave: async () => undefined,
    cancelCloseAfterSave: async () => undefined,
    onOpenRequest: () => () => undefined,
    onSaveBeforeClose: () => () => undefined,
    onMenuNew: () => () => undefined,
    onMenuOpen: () => () => undefined,
    onMenuSave: () => () => undefined,
    onMenuSaveAs: () => () => undefined,
    onMenuCloseTab: () => () => undefined,
    onMenuTogglePreview: () => () => undefined,
    onMenuFontSize: () => () => undefined,
    onMenuReadingWidth: () => () => undefined,
    onMenuTheme: () => () => undefined,
    onMenuFind: () => () => undefined,
    onMenuOpenRecent: () => () => undefined,
    setLivePreview: async () => undefined,
    setEditorPreferences: async () => undefined,
    saveRecoveryDraft: async () => undefined,
    getRecoveryDraft: async () => null,
    clearRecoveryDraft: async () => undefined,
  };
}
