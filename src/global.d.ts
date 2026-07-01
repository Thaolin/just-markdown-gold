export {};

declare global {
  interface Window {
    markdownFiles: {
      getPendingOpen: () => Promise<string | null>;
      openDialog: () => Promise<string | null>;
      read: (filePath: string) => Promise<{ filePath: string; content: string }>;
      save: (payload: { filePath: string; content: string }) => Promise<{ filePath: string }>;
      saveAs: (payload: {
        defaultPath?: string;
        content: string;
      }) => Promise<{ filePath: string } | null>;
      setDirty: (dirty: boolean) => Promise<void>;
      confirmUnsaved: (fileLabel: string) => Promise<"save" | "discard" | "cancel">;
      closeAfterSave: () => Promise<void>;
      cancelCloseAfterSave: () => Promise<void>;
      onOpenRequest: (callback: (filePath: string) => void) => () => void;
      onSaveBeforeClose: (callback: () => void) => () => void;
      onMenuNew: (callback: () => void) => () => void;
      onMenuOpen: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuSaveAs: (callback: () => void) => () => void;
      onMenuTogglePreview: (callback: () => void) => () => void;
      onMenuFind: (callback: () => void) => () => void;
      onMenuOpenRecent: (callback: (filePath: string) => void) => () => void;
      setLivePreview: (enabled: boolean) => Promise<void>;
      saveRecoveryDraft: (content: string) => Promise<void>;
      getRecoveryDraft: () => Promise<string | null>;
      clearRecoveryDraft: () => Promise<void>;
    };
  }
}
