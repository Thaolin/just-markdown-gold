import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import DurableEditor, { findInEditor, formatInEditor } from "./editor/DurableEditor";
import type { MarkdownCommand } from "./editor/markdownKeymap";
import {
  FONT_SIZE_KEY,
  FONT_SIZE_OPTIONS,
  READING_WIDTH_KEY,
  READING_WIDTH_OPTIONS,
  THEME_KEY,
  THEME_OPTIONS,
  loadPreference,
  savePreference,
  type FontSizePreference,
  type ReadingWidthPreference,
  type ThemePreference,
} from "./preferences";

const BLANK_DOC = "";
const WELCOME_DOC = "# Welcome to Just Markdown: Gold Edition\n\nOpen a file or start typing.\n\nThe Markdown editor arms race is over. This one opens files.\n\n";
const WELCOME_SEEN_KEY = "just-markdown-welcome-seen";

let runtimeInitialUntitledContent: string | null = null;

function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
  } catch {
    // If localStorage is unavailable, keep the editor usable with the in-memory default.
  }
}

function initialUntitledContent(): string {
  if (runtimeInitialUntitledContent !== null) return runtimeInitialUntitledContent;
  runtimeInitialUntitledContent = hasSeenWelcome() ? BLANK_DOC : WELCOME_DOC;
  return runtimeInitialUntitledContent;
}

interface FormatButton {
  command: MarkdownCommand;
  label: string;
  title: string;
  content: ReactNode;
}

const FORMAT_BUTTONS: FormatButton[] = [
  { command: "bold", label: "Bold", title: "Bold (Ctrl+B)", content: <strong>B</strong> },
  { command: "italic", label: "Italic", title: "Italic (Ctrl+I)", content: <em>I</em> },
  { command: "h1", label: "Heading 1", title: "Heading 1 (Ctrl+Alt+1)", content: "H1" },
  { command: "h2", label: "Heading 2", title: "Heading 2 (Ctrl+Alt+2)", content: "H2" },
  { command: "h3", label: "Heading 3", title: "Heading 3 (Ctrl+Alt+3)", content: "H3" },
  { command: "quote", label: "Quote", title: "Quote (Ctrl+Shift+.)", content: ">" },
  { command: "bulletList", label: "Bullet list", title: "Bullet list (Ctrl+Shift+8)", content: "-" },
  { command: "numberedList", label: "Numbered list", title: "Numbered list (Ctrl+Shift+7)", content: "1." },
];

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
  const initialContent = useMemo(() => initialUntitledContent(), []);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [livePreview, setLivePreview] = useState(true);
  const [fontSize, setFontSize] = useState<FontSizePreference>(() =>
    loadPreference(FONT_SIZE_KEY, FONT_SIZE_OPTIONS, "default")
  );
  const [readingWidth, setReadingWidth] = useState<ReadingWidthPreference>(() =>
    loadPreference(READING_WIDTH_KEY, READING_WIDTH_OPTIONS, "standard")
  );
  const [theme, setTheme] = useState<ThemePreference>(() =>
    loadPreference(THEME_KEY, THEME_OPTIONS, "gold")
  );
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
    if (initialContent === WELCOME_DOC) markWelcomeSeen();
  }, [initialContent]);

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

  const runFormatting = useCallback((command: MarkdownCommand) => {
    formatInEditor(command);
  }, []);

  const keepEditorSelection = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // Formatting commands rely on the editor's current selection; keep toolbar clicks from blurring it.
    event.preventDefault();
  }, []);

  const newDoc = useCallback(async () => {
    if (!(await confirmBeforeLosingChanges())) return;
    cancelRecoveryTimer();
    setFilePath(null);
    setContent(BLANK_DOC);
    setSavedContent(BLANK_DOC);
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
    return window.markdownFiles.onMenuFontSize((nextFontSize) => setFontSize(nextFontSize));
  }, []);

  useEffect(() => {
    return window.markdownFiles.onMenuReadingWidth((nextReadingWidth) => setReadingWidth(nextReadingWidth));
  }, []);

  useEffect(() => {
    return window.markdownFiles.onMenuTheme((nextTheme) => setTheme(nextTheme));
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
    savePreference(FONT_SIZE_KEY, fontSize);
    savePreference(READING_WIDTH_KEY, readingWidth);
    savePreference(THEME_KEY, theme);
    void window.markdownFiles.setEditorPreferences({ fontSize, readingWidth, theme }).then((result) => {
      if (!result.ok) console.warn("Editor preference sync failed", result.error);
    }).catch((e) => console.warn("Editor preference sync failed", e));
  }, [fontSize, readingWidth, theme]);

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
    setSavedContent(BLANK_DOC); // still dirty because there is no real file yet
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

  const actionDisabled = status === "loading";
  const saveDisabled = status === "saving" || actionDisabled || (!dirty && !!filePath);
  const saveAsDisabled = status === "saving" || actionDisabled;
  const editorPlaceholder = filePath ? "Write Markdown..." : "Start typing...";

  return (
    <main className={`app-shell theme-${theme} font-${fontSize} measure-${readingWidth}`}>
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
            <button
              type="button"
              className="tool-button"
              onClick={() => void newDoc()}
              disabled={actionDisabled}
              title="New (Ctrl+N)"
            >
              <span className="tool-icon" aria-hidden="true">+</span>
              <span>New</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => void openDialog()}
              disabled={actionDisabled}
              title="Open (Ctrl+O)"
            >
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
            <button
              type="button"
              className="tool-button"
              onClick={() => void saveAs()}
              disabled={saveAsDisabled}
              title="Save As"
            >
              <span className="tool-icon" aria-hidden="true">…</span>
              <span>Save As</span>
            </button>
          </div>
          <div className="tool-group format-group" aria-label="Markdown formatting">
            {FORMAT_BUTTONS.map((button) => (
              <button
                key={button.command}
                type="button"
                className="tool-button icon-button"
                onMouseDown={keepEditorSelection}
                onClick={() => runFormatting(button.command)}
                disabled={status === "loading"}
                title={button.title}
                aria-label={button.label}
              >
                {button.content}
              </button>
            ))}
            <button
              type="button"
              className="tool-button find-button"
              onMouseDown={keepEditorSelection}
              onClick={() => findInEditor()}
              disabled={status === "loading"}
              title="Find (Ctrl+F)"
            >
              Find
            </button>
          </div>
          <label className={`toggle ${livePreview ? "is-active" : ""}`} title="Hide Markdown marks while writing">
            <input
              type="checkbox"
              checked={livePreview}
              onChange={(event) => setLivePreview(event.target.checked)}
              aria-label="Live Preview"
            />
            <span>Live Preview</span>
          </label>
        </div>
      </header>

      <div className="subbar" aria-live="polite">
        <span className={`status-pill ${dirty ? "is-dirty" : ""}`}>{statusText}</span>
        <span>{words.toLocaleString()} words</span>
      </div>

      {error ? <div className="error-strip" role="alert">{error}</div> : null}

      {recoveryDraft ? (
        <div className="recovery-strip" role="status">
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
        placeholderText={editorPlaceholder}
      />

      <footer className="statusbar">
        <span>{dirty ? "Unsaved changes" : "Changes saved"}</span>
        <span>{livePreview ? "Live Preview" : "Raw Markdown"}</span>
      </footer>
    </main>
  );
}
