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
      log: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
      onOpenRequest: (callback: (filePath: string) => void) => () => void;
      onSaveBeforeClose: (callback: () => void) => () => void;
    };
  }
}
