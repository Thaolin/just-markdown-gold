import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DurableEditor, { findInEditor } from "./editor/DurableEditor";

const EMPTY_DOC = "# Untitled\n\n";

function fileName(filePath: string | null): string {
  if (!filePath) return "Untitled.md";
  return filePath.split(/[\\/]/).pop() || filePath;
}

function positionKey(filePath: string | null): string {
  return filePath ?? "untitled";
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export default function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState(EMPTY_DOC);
  const [savedContent, setSavedContent] = useState(EMPTY_DOC);
  const [livePreview, setLivePreview] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<string | null>(null);

  const dirty = content !== savedContent;
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = `${dirty ? "*" : ""}${fileName(filePath)} - Just Markdown: Gold Edition`;
  const pathLabel = filePath ?? "Unsaved local Markdown file";
  const words = wordCount(content);

  const cancelRecoveryTimer = useCallback(() => {
    if (recoveryTimer.current) {
      clearTimeout(recoveryTimer.current);
      recoveryTimer.current = null;
    }
  }, []);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    void window.markdownFiles.setDirty(dirty);
  }, [dirty]);

  const saveAs = useCallback(async (): Promise<boolean> => {
    setStatus("saving");
    setError(null);
    try {
      const result = await window.markdownFiles.saveAs({
        defaultPath: filePath ?? "untitled.md",
        content,
      });
      if (!result) {
        setStatus("idle");
        return false;
      }
      setFilePath(result.filePath);
      setSavedContent(content);
      setStatus("idle");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
      return false;
    }
  }, [content, filePath]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!filePath) return saveAs();
    setStatus("saving");
    setError(null);
    try {
      await window.markdownFiles.save({ filePath, content });
      setSavedContent(content);
      setStatus("idle");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
      return false;
    }
  }, [content, filePath, saveAs]);

  const confirmBeforeLosingChanges = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const action = await window.markdownFiles.confirmUnsaved(fileName(filePath));
    if (action === "discard") return true;
    if (action === "save") return save();
    return false;
  }, [dirty, filePath, save]);

  useEffect(() => {
    return window.markdownFiles.onSaveBeforeClose(() => {
      void save().then((saved) => {
        if (saved) void window.markdownFiles.closeAfterSave();
        else void window.markdownFiles.cancelCloseAfterSave();
      });
    });
  }, [save]);

  const openPath = useCallback(
    async (nextPath: string) => {
      console.log("openPath requested", { filePath: nextPath });
      if (!(await confirmBeforeLosingChanges())) return;
      cancelRecoveryTimer();
      setStatus("loading");
      setError(null);
      try {
        const doc = await window.markdownFiles.read(nextPath);
        setFilePath(doc.filePath);
        setContent(doc.content);
        setSavedContent(doc.content);
        setStatus("idle");
        setRecoveryDraft(null);
        void window.markdownFiles.clearRecoveryDraft();
        console.log("openPath loaded", { filePath: doc.filePath, chars: doc.content.length });
      } catch (e) {
        console.error("openPath failed", {
          filePath: nextPath,
          message: (e as Error).message,
          stack: (e as Error).stack,
        });
        setError((e as Error).message);
        setStatus("error");
      }
    },
    [cancelRecoveryTimer, confirmBeforeLosingChanges]
  );

  const openDialog = useCallback(async () => {
    const nextPath = await window.markdownFiles.openDialog();
    if (nextPath) await openPath(nextPath);
  }, [openPath]);

  const newDoc = useCallback(async () => {
    if (!(await confirmBeforeLosingChanges())) return;
    cancelRecoveryTimer();
    setFilePath(null);
    setContent(EMPTY_DOC);
    setSavedContent(EMPTY_DOC);
    setError(null);
    setStatus("idle");
    setRecoveryDraft(null);
    void window.markdownFiles.clearRecoveryDraft();
  }, [cancelRecoveryTimer, confirmBeforeLosingChanges]);

  // --- Native menu listeners ---

  useEffect(() => {
    return window.markdownFiles.onMenuNew(() => void newDoc());
  }, [newDoc]);

  useEffect(() => {
    return window.markdownFiles.onMenuOpen(() => void openDialog());
  }, [openDialog]);

  useEffect(() => {
    return window.markdownFiles.onMenuSave(() => void save());
  }, [save]);

  useEffect(() => {
    return window.markdownFiles.onMenuSaveAs(() => void saveAs());
  }, [saveAs]);

  useEffect(() => {
    return window.markdownFiles.onMenuTogglePreview(() => setLivePreview((p) => !p));
  }, []);

  useEffect(() => {
    return window.markdownFiles.onMenuOpenRecent((recentPath) => void openPath(recentPath));
  }, [openPath]);

  useEffect(() => {
    return window.markdownFiles.onMenuFind(() => findInEditor());
  }, []);

  useEffect(() => {
    window.markdownFiles.setLivePreview(livePreview).catch(() => {});
  }, [livePreview]);

  useEffect(() => {
    let cancelled = false;
    void window.markdownFiles.getPendingOpen().then((nextPath) => {
      if (cancelled) return;
      if (nextPath) {
        void openPath(nextPath);
      } else {
        // ponytail: recovery draft only on fresh launch with no file to open
        void window.markdownFiles.getRecoveryDraft().then((draft) => {
          if (!cancelled && draft) setRecoveryDraft(draft);
        });
      }
    });
    const off = window.markdownFiles.onOpenRequest((nextPath) => {
      if (!cancelled) void openPath(nextPath);
    });
    return () => { cancelled = true; off(); };
  }, [openPath]);

  // ── Debounced recovery-draft save while dirty ──
  useEffect(() => {
    if (!dirty) {
      cancelRecoveryTimer();
      void window.markdownFiles.clearRecoveryDraft();
      return;
    }
    cancelRecoveryTimer();
    recoveryTimer.current = setTimeout(() => {
      recoveryTimer.current = null;
      void window.markdownFiles.saveRecoveryDraft(content);
    }, 2000);
    return cancelRecoveryTimer;
  }, [cancelRecoveryTimer, dirty, content]);

  const restoreRecovery = useCallback(() => {
    if (!recoveryDraft) return;
    cancelRecoveryTimer();
    setContent(recoveryDraft);
    setSavedContent(EMPTY_DOC); // still dirty — no real file yet
    setFilePath(null);
    setRecoveryDraft(null);
    setError(null);
    setStatus("idle");
  }, [cancelRecoveryTimer, recoveryDraft]);

  const dismissRecovery = useCallback(() => {
    cancelRecoveryTimer();
    setRecoveryDraft(null);
    void window.markdownFiles.clearRecoveryDraft();
  }, [cancelRecoveryTimer]);

  const statusText = useMemo(() => {
    if (status === "loading") return "loading";
    if (status === "saving") return "saving";
    if (status === "error") return "error";
    return dirty ? "modified" : "saved";
  }, [dirty, status]);

  const saveDisabled = status === "saving" || (!dirty && !!filePath);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="identity">
          <div className="title-row">
            <span className={`dirty-dot ${dirty ? "is-dirty" : ""}`} aria-hidden="true" />
            <strong>{fileName(filePath)}</strong>
          </div>
          <span>{pathLabel}</span>
        </div>
        <div className="toolbar">
          <div className="tool-group">
            <button type="button" className="tool-button" onClick={() => void newDoc()} title="New (Ctrl+N)">
              <span className="tool-icon" aria-hidden="true">+</span>
              <span>New</span>
            </button>
            <button type="button" className="tool-button" onClick={() => void openDialog()} title="Open (Ctrl+O)">
              <span className="tool-icon" aria-hidden="true">↗</span>
              <span>Open</span>
            </button>
          </div>
          <div className="tool-group">
            <button
              type="button"
              className="tool-button primary"
              onClick={() => void save()}
              disabled={saveDisabled}
              title="Save (Ctrl+S)"
            >
              <span className="tool-icon" aria-hidden="true">✓</span>
              <span>Save</span>
            </button>
            <button type="button" className="tool-button" onClick={() => void saveAs()} title="Save As">
              <span className="tool-icon" aria-hidden="true">…</span>
              <span>Save As</span>
            </button>
          </div>
          <label className="toggle" title="Hide Markdown marks while writing">
            <input
              type="checkbox"
              checked={livePreview}
              onChange={(event) => setLivePreview(event.target.checked)}
            />
            <span>Live Preview</span>
          </label>
        </div>
      </header>

      <div className="subbar">
        <span className={`status-pill ${dirty ? "is-dirty" : ""}`}>{statusText}</span>
        <span>{words.toLocaleString()} words</span>
        <span>Ctrl+B/I</span>
        <span>Ctrl+Alt+1/2/3</span>
        <span>Ctrl+Shift+./8/7</span>
        <span>Ctrl+F</span>
      </div>

      {error ? <div className="error-strip">{error}</div> : null}

      {recoveryDraft ? (
        <div className="recovery-strip">
          <span>Recovery draft found — unsaved changes from a previous session.</span>
          <button type="button" className="tool-button primary" onClick={restoreRecovery}>Restore</button>
          <button type="button" className="tool-button" onClick={dismissRecovery}>Dismiss</button>
        </div>
      ) : null}

      <DurableEditor
        key={positionKey(filePath)}
        docKey={positionKey(filePath)}
        value={content}
        onChange={setContent}
        readOnly={status === "loading"}
        livePreview={livePreview}
      />

      <footer className="statusbar">
        <span>{dirty ? "Unsaved changes" : "Changes saved"}</span>
        <span>{livePreview ? "Live Preview" : "Raw Markdown"}</span>
      </footer>
    </main>
  );
}
