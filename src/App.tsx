import { useCallback, useEffect, useMemo, useState } from "react";
import DurableEditor from "./editor/DurableEditor";

const EMPTY_DOC = "# Untitled\n\n";

function fileName(filePath: string | null): string {
  if (!filePath) return "Untitled.md";
  return filePath.split(/[\\/]/).pop() || filePath;
}

function positionKey(filePath: string | null): string {
  return filePath ?? "untitled";
}

export default function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState(EMPTY_DOC);
  const [savedContent, setSavedContent] = useState(EMPTY_DOC);
  const [livePreview, setLivePreview] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== savedContent;
  const title = `${dirty ? "*" : ""}${fileName(filePath)} - Markdown Editor`;
  const pathLabel = filePath ?? "Unsaved local Markdown file";

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
      if (!(await confirmBeforeLosingChanges())) return;
      setStatus("loading");
      setError(null);
      try {
        const doc = await window.markdownFiles.read(nextPath);
        setFilePath(doc.filePath);
        setContent(doc.content);
        setSavedContent(doc.content);
        setStatus("idle");
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    },
    [confirmBeforeLosingChanges]
  );

  const openDialog = useCallback(async () => {
    const nextPath = await window.markdownFiles.openDialog();
    if (nextPath) await openPath(nextPath);
  }, [openPath]);

  const newDoc = useCallback(async () => {
    if (!(await confirmBeforeLosingChanges())) return;
    setFilePath(null);
    setContent(EMPTY_DOC);
    setSavedContent(EMPTY_DOC);
    setError(null);
    setStatus("idle");
  }, [confirmBeforeLosingChanges]);

  useEffect(() => {
    void window.markdownFiles.getPendingOpen().then((nextPath) => {
      if (nextPath) void openPath(nextPath);
    });
    return window.markdownFiles.onOpenRequest((nextPath) => void openPath(nextPath));
  }, [openPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openDialog();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void newDoc();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newDoc, openDialog, save]);

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
        <span>{content.length.toLocaleString()} chars</span>
        <span>Ctrl+B/I</span>
        <span>Ctrl+Alt+1/2/3</span>
        <span>Ctrl+F</span>
      </div>

      {error ? <div className="error-strip">{error}</div> : null}

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
