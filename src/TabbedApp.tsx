import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
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
let nextDocumentId = 1;

interface DocumentTab {
  id: string;
  filePath: string | null;
  content: string;
  savedContent: string;
}

interface RecoveryDraft {
  filePath: string | null;
  content: string;
}

type DocumentStatus = "idle" | "loading" | "saving" | "error";

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

function createDocument(
  content = BLANK_DOC,
  filePath: string | null = null,
  savedContent = content
): DocumentTab {
  return {
    id: `document-${nextDocumentId++}`,
    filePath,
    content,
    savedContent,
  };
}

function createRecoveredUntitledDocument(content: string): DocumentTab {
  return createDocument(content, null, content === "" ? "\u0000" : "");
}

function fileName(filePath: string | null): string {
  if (!filePath) return "Untitled.md";
  return filePath.split(/[\\/]/).pop() || filePath;
}

function positionKey(document: DocumentTab): string {
  return document.filePath ?? `untitled-${document.id}`;
}

function isDirty(document: DocumentTab): boolean {
  return document.content !== document.savedContent;
}

function isPristineUntitled(document: DocumentTab, initialContent: string): boolean {
  return !document.filePath
    && document.content === initialContent
    && document.savedContent === initialContent;
}

function sameFilePath(first: string | null, second: string | null): boolean {
  if (!first || !second) return false;
  const normalizedFirst = first.replace(/\\/g, "/");
  const normalizedSecond = second.replace(/\\/g, "/");
  return window.markdownFiles.platform === "win32"
    ? normalizedFirst.toLocaleLowerCase() === normalizedSecond.toLocaleLowerCase()
    : normalizedFirst === normalizedSecond;
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function isRecoveryDraft(value: unknown): value is RecoveryDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.filePath === null || typeof candidate.filePath === "string")
    && typeof candidate.content === "string";
}

function parseRecoveryDrafts(raw: string): RecoveryDraft[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed
      && typeof parsed === "object"
      && Array.isArray((parsed as { drafts?: unknown }).drafts)
    ) {
      return (parsed as { drafts: unknown[] }).drafts.filter(isRecoveryDraft);
    }
  } catch {
    // Pre-tab releases stored the raw Markdown buffer directly.
  }
  return [{ filePath: null, content: raw }];
}

function serializeRecoveryDrafts(documents: DocumentTab[]): string | null {
  const drafts = documents
    .filter(isDirty)
    .map(({ filePath, content }) => ({ filePath, content }));
  return drafts.length === 0 ? null : JSON.stringify({ version: 1, drafts });
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

export default function TabbedApp() {
  const initialContent = useMemo(() => initialUntitledContent(), []);
  const [documents, setDocuments] = useState<DocumentTab[]>(() => [createDocument(initialContent)]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => documents[0].id);
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
  const [status, setStatus] = useState<DocumentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recoveryPrompt, setRecoveryPrompt] = useState<RecoveryDraft[] | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  const documentsRef = useRef(documents);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryRevision = useRef(0);
  const recoveryOperation = useRef<Promise<void>>(Promise.resolve());
  const previouslyDirty = useRef(false);
  const openingDocument = useRef(false);
  const queuedOpenPaths = useRef<string[]>([]);
  const initialLoad = useRef<Promise<{ pendingPaths: string[]; rawRecovery: string | null }> | null>(null);
  documentsRef.current = documents;

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? documents[0];
  const dirty = isDirty(activeDocument);
  const hasDirtyDocuments = documents.some(isDirty);
  const busy = status === "loading" || status === "saving";
  const title = `${dirty ? "*" : ""}${fileName(activeDocument.filePath)} - Just Markdown: Gold Edition`;
  const pathLabel = activeDocument.filePath ?? "Unsaved local Markdown file";
  const words = wordCount(activeDocument.content);
  const recoveryPayload = useMemo(() => serializeRecoveryDrafts(documents), [documents]);

  const cancelRecoveryTimer = useCallback(() => {
    if (recoveryTimer.current) {
      clearTimeout(recoveryTimer.current);
      recoveryTimer.current = null;
    }
  }, []);

  const invalidateRecoverySnapshot = useCallback(() => {
    recoveryRevision.current += 1;
    cancelRecoveryTimer();
  }, [cancelRecoveryTimer]);

  const updateDocument = useCallback((documentId: string, update: (document: DocumentTab) => DocumentTab) => {
    setDocuments((current) => current.map((document) => (
      document.id === documentId ? update(document) : document
    )));
  }, []);

  const reportRecoveryError = useCallback((cause: unknown) => {
    setError(`Recovery draft could not be updated: ${(cause as Error).message}`);
    setStatus("error");
  }, []);

  const queueRecoveryOperation = useCallback((operation: () => Promise<void>): Promise<void> => {
    const next = recoveryOperation.current.then(operation, operation);
    recoveryOperation.current = next.catch(() => {});
    return next;
  }, []);

  const commitSavedDocument = useCallback((documentId: string, filePath: string, savedContent: string) => {
    const nextDocuments = documentsRef.current.map((current) => (
      current.id === documentId ? { ...current, filePath, savedContent } : current
    ));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    return nextDocuments;
  }, []);

  const syncRecoverySnapshot = useCallback(async (nextDocuments: DocumentTab[]) => {
    const nextRecoveryPayload = serializeRecoveryDrafts(nextDocuments);
    await queueRecoveryOperation(() => (
      nextRecoveryPayload
        ? window.markdownFiles.saveRecoveryDraft(nextRecoveryPayload)
        : window.markdownFiles.clearRecoveryDraft()
    ));
  }, [queueRecoveryOperation]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (initialContent === WELCOME_DOC) markWelcomeSeen();
  }, [initialContent]);

  useEffect(() => {
    void window.markdownFiles.setDirty({
      dirty: hasDirtyDocuments,
      count: documents.filter(isDirty).length,
    }).catch(() => {});
  }, [documents, hasDirtyDocuments]);

  useEffect(() => {
    if (!recoveryChecked || !previouslyDirty.current || hasDirtyDocuments || recoveryPrompt) {
      previouslyDirty.current = hasDirtyDocuments;
      return;
    }
    void queueRecoveryOperation(() => window.markdownFiles.clearRecoveryDraft()).catch(reportRecoveryError);
    previouslyDirty.current = false;
  }, [hasDirtyDocuments, queueRecoveryOperation, recoveryChecked, recoveryPrompt, reportRecoveryError]);

  useEffect(() => {
    const revision = ++recoveryRevision.current;
    if (!recoveryChecked || recoveryPrompt || !recoveryPayload) {
      cancelRecoveryTimer();
      return;
    }
    cancelRecoveryTimer();
    recoveryTimer.current = setTimeout(() => {
      recoveryTimer.current = null;
      void queueRecoveryOperation(async () => {
        if (revision !== recoveryRevision.current) return;
        await window.markdownFiles.saveRecoveryDraft(recoveryPayload);
      }).catch(reportRecoveryError);
    }, 2000);
    return cancelRecoveryTimer;
  }, [cancelRecoveryTimer, queueRecoveryOperation, recoveryChecked, recoveryPayload, recoveryPrompt, reportRecoveryError]);

  useEffect(() => cancelRecoveryTimer, [cancelRecoveryTimer]);

  const writeDocument = useCallback(async (
    document: DocumentTab,
    forceSaveAs = false,
    reservedOpenPaths: string[] = []
  ): Promise<boolean> => {
    if (busy) return false;
    setStatus("saving");
    setError(null);

    try {
      if (document.filePath && !forceSaveAs) {
        const result = await window.markdownFiles.save({ filePath: document.filePath, content: document.content });
        invalidateRecoverySnapshot();
        await syncRecoverySnapshot(commitSavedDocument(document.id, result.filePath, document.content));
        reservedOpenPaths.push(result.filePath);
      } else {
        const result = await window.markdownFiles.saveAs({
          defaultPath: document.filePath ?? "untitled.md",
          content: document.content,
          openPaths: [...new Set([
            ...documentsRef.current
              .filter((current) => current.id !== document.id && current.filePath)
              .map((current) => current.filePath as string),
            ...reservedOpenPaths,
          ])],
        });
        if (!result) {
          setStatus("idle");
          return false;
        }
        invalidateRecoverySnapshot();
        await syncRecoverySnapshot(commitSavedDocument(document.id, result.filePath, document.content));
        reservedOpenPaths.push(result.filePath);
      }
      setStatus("idle");
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("error");
      return false;
    }
  }, [busy, commitSavedDocument, invalidateRecoverySnapshot, syncRecoverySnapshot]);

  const save = useCallback(
    async (): Promise<boolean> => writeDocument(activeDocument),
    [activeDocument, writeDocument]
  );

  const saveAs = useCallback(
    async (): Promise<boolean> => writeDocument(activeDocument, true),
    [activeDocument, writeDocument]
  );

  const saveAll = useCallback(async (): Promise<boolean> => {
    const dirtyDocuments = documents.filter(isDirty);
    const reservedOpenPaths: string[] = [];
    for (const document of dirtyDocuments) {
      if (!(await writeDocument(document, false, reservedOpenPaths))) return false;
    }
    try {
      invalidateRecoverySnapshot();
      await queueRecoveryOperation(() => window.markdownFiles.clearRecoveryDraft());
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("error");
      return false;
    }
  }, [documents, invalidateRecoverySnapshot, queueRecoveryOperation, writeDocument]);

  const confirmBeforeLosingChanges = useCallback(async (document: DocumentTab): Promise<boolean> => {
    if (!isDirty(document)) return true;
    const action = await window.markdownFiles.confirmUnsaved(fileName(document.filePath));
    if (action === "discard") return true;
    if (action === "save") return writeDocument(document);
    return false;
  }, [writeDocument]);

  const newDoc = useCallback(() => {
    if (busy) return;
    const nextDocument = createDocument();
    setDocuments((current) => [...current, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    setError(null);
    setStatus("idle");
  }, [busy]);

  const openPath = useCallback(async (nextPath: string) => {
    if (busy || openingDocument.current) {
      if (!queuedOpenPaths.current.some((queuedPath) => sameFilePath(queuedPath, nextPath))) {
        queuedOpenPaths.current.push(nextPath);
      }
      return;
    }

    const existing = documentsRef.current.find((document) => sameFilePath(document.filePath, nextPath));
    if (existing) {
      setActiveDocumentId(existing.id);
      setError(null);
      setStatus("idle");
      const queuedPath = queuedOpenPaths.current.shift();
      if (queuedPath) window.queueMicrotask(() => void openPathRef.current(queuedPath));
      return;
    }

    setStatus("loading");
    setError(null);
    openingDocument.current = true;
    try {
      const loaded = await window.markdownFiles.read(nextPath);
      const existingDocument = documentsRef.current.find((document) => (
        sameFilePath(document.filePath, loaded.filePath)
      ));
      if (existingDocument) {
        setActiveDocumentId(existingDocument.id);
        setStatus("idle");
        const queuedPath = queuedOpenPaths.current.shift();
        if (queuedPath) window.queueMicrotask(() => void openPathRef.current(queuedPath));
        return;
      }
      const nextDocument = createDocument(loaded.content, loaded.filePath);
      const current = documentsRef.current;
      const replaceInitial = current.length === 1 && isPristineUntitled(current[0], initialContent);
      setDocuments(replaceInitial ? [nextDocument] : [...current, nextDocument]);
      setActiveDocumentId(nextDocument.id);
      setStatus("idle");
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("error");
    } finally {
      openingDocument.current = false;
    }
  }, [busy, initialContent]);

  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;

  useEffect(() => {
    if (busy || openingDocument.current) return;
    const nextPath = queuedOpenPaths.current.shift();
    if (nextPath) void openPathRef.current(nextPath);
  }, [busy]);

  const openDialog = useCallback(async () => {
    if (busy) return;
    const nextPath = await window.markdownFiles.openDialog();
    if (nextPath) await openPath(nextPath);
  }, [busy, openPath]);

  const closeDocument = useCallback(async (documentId = activeDocumentId) => {
    if (busy) return;
    const current = documentsRef.current;
    const document = current.find((item) => item.id === documentId);
    if (!document || !(await confirmBeforeLosingChanges(document))) return;

    if (current.length === 1) {
      const replacement = createDocument();
      setDocuments([replacement]);
      setActiveDocumentId(replacement.id);
      return;
    }

    const index = current.findIndex((item) => item.id === documentId);
    const nextActive = current[index + 1] ?? current[index - 1];
    setDocuments(current.filter((item) => item.id !== documentId));
    if (documentId === activeDocumentId) setActiveDocumentId(nextActive.id);
  }, [activeDocumentId, busy, confirmBeforeLosingChanges]);

  const moveTabFocus = useCallback((index: number) => {
    const nextDocument = documents[index];
    if (!nextDocument) return;
    setActiveDocumentId(nextDocument.id);
    window.requestAnimationFrame(() => {
      window.document.getElementById("tab-" + nextDocument.id)?.focus();
    });
  }, [documents]);

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTabFocus((index + 1) % documents.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTabFocus((index - 1 + documents.length) % documents.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTabFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTabFocus(documents.length - 1);
    }
  }, [documents.length, moveTabFocus]);

  const runFormatting = useCallback((command: MarkdownCommand) => {
    formatInEditor(command);
  }, []);

  const keepEditorSelection = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // Formatting commands rely on the editor's current selection; keep toolbar clicks from blurring it.
    event.preventDefault();
  }, []);

  useEffect(() => {
    return window.markdownFiles.onSaveBeforeClose(() => {
      void saveAll().then((saved) => {
        if (saved) void window.markdownFiles.closeAfterSave();
        else void window.markdownFiles.cancelCloseAfterSave();
      });
    });
  }, [saveAll]);

  useEffect(() => {
    return window.markdownFiles.onMenuNew(() => newDoc());
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
    return window.markdownFiles.onMenuCloseTab(() => void closeDocument());
  }, [closeDocument]);

  useEffect(() => {
    return window.markdownFiles.onMenuTogglePreview(() => setLivePreview((preview) => !preview));
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
    return window.markdownFiles.onMenuOpenRecent((recentPath) => void openPathRef.current(recentPath));
  }, []);

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
    void window.markdownFiles.setEditorPreferences({ fontSize, readingWidth, theme })
      .catch(() => {});
  }, [fontSize, readingWidth, theme]);

  useEffect(() => {
    let cancelled = false;
    if (!initialLoad.current) {
      initialLoad.current = (async () => {
        const pendingPaths = await window.markdownFiles.getPendingOpen();
        const rawRecovery = await window.markdownFiles.getRecoveryDraft();
        return { pendingPaths, rawRecovery };
      })();
    }
    void initialLoad.current.then(async ({ pendingPaths, rawRecovery }) => {
      try {
        for (const pendingPath of pendingPaths) {
          if (cancelled) break;
          await openPathRef.current(pendingPath);
        }
        if (!cancelled && rawRecovery !== null) {
          const drafts = parseRecoveryDrafts(rawRecovery);
          if (drafts.length > 0) setRecoveryPrompt(drafts);
          else void queueRecoveryOperation(() => window.markdownFiles.clearRecoveryDraft()).catch(reportRecoveryError);
        }
      } catch (cause) {
        if (!cancelled) {
          setError((cause as Error).message);
          setStatus("error");
        }
      } finally {
        if (!cancelled) setRecoveryChecked(true);
      }
    }).catch((cause) => {
      if (!cancelled) {
        setError((cause as Error).message);
        setStatus("error");
        setRecoveryChecked(true);
      }
    });
    const off = window.markdownFiles.onOpenRequest((nextPath) => {
      void openPathRef.current(nextPath);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [queueRecoveryOperation, reportRecoveryError]);

  const restoreRecovery = useCallback(async () => {
    if (!recoveryPrompt || busy) return;
    setStatus("loading");
    setError(null);
    try {
      invalidateRecoverySnapshot();
      const restored = await Promise.all(recoveryPrompt.map(async (draft) => {
        if (!draft.filePath) return createRecoveredUntitledDocument(draft.content);
        try {
          const onDisk = await window.markdownFiles.read(draft.filePath);
          return createDocument(draft.content, onDisk.filePath, onDisk.content);
        } catch {
          return createRecoveredUntitledDocument(draft.content);
        }
      }));
      const current = documentsRef.current;
      const replaceInitial = current.length === 1 && isPristineUntitled(current[0], initialContent);
      const nextDocuments = replaceInitial ? [] : [...current];
      let firstRestoredId: string | null = null;
      for (const restoredDocument of restored) {
        const existingIndex = restoredDocument.filePath
          ? nextDocuments.findIndex((currentDocument) => (
            sameFilePath(currentDocument.filePath, restoredDocument.filePath)
          ))
          : -1;

        if (existingIndex < 0) {
          nextDocuments.push(restoredDocument);
          firstRestoredId ??= restoredDocument.id;
          continue;
        }

        const existingDocument = nextDocuments[existingIndex];
        if (!isDirty(existingDocument)) {
          nextDocuments[existingIndex] = { ...restoredDocument, id: existingDocument.id };
          firstRestoredId ??= existingDocument.id;
          continue;
        }

        const untitledRecovery = createRecoveredUntitledDocument(restoredDocument.content);
        nextDocuments.push(untitledRecovery);
        firstRestoredId ??= untitledRecovery.id;
      }
      setDocuments(nextDocuments);
      setActiveDocumentId(firstRestoredId ?? activeDocumentId);
      setRecoveryPrompt(null);
      const nextRecoveryPayload = serializeRecoveryDrafts(nextDocuments);
      await queueRecoveryOperation(() => (
        nextRecoveryPayload
          ? window.markdownFiles.saveRecoveryDraft(nextRecoveryPayload)
          : window.markdownFiles.clearRecoveryDraft()
      ));
      setStatus("idle");
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("error");
    }
  }, [activeDocumentId, busy, initialContent, invalidateRecoverySnapshot, queueRecoveryOperation, recoveryPrompt]);

  const dismissRecovery = useCallback(() => {
    invalidateRecoverySnapshot();
    setRecoveryPrompt(null);
    void queueRecoveryOperation(() => window.markdownFiles.clearRecoveryDraft()).catch(reportRecoveryError);
  }, [invalidateRecoverySnapshot, queueRecoveryOperation, reportRecoveryError]);

  const statusText = useMemo(() => {
    if (status === "loading") return "loading";
    if (status === "saving") return "saving";
    if (status === "error") return "error";
    return dirty ? "modified" : "saved";
  }, [dirty, status]);

  const saveDisabled = busy || (!dirty && !!activeDocument.filePath);
  const editorPlaceholder = activeDocument.filePath ? "Write Markdown..." : "Start typing...";

  return (
    <main className={`app-shell theme-${theme} font-${fontSize} measure-${readingWidth}`}>
      <header className="topbar">
        <div className="identity">
          <div className="title-row">
            <span className={`dirty-dot ${dirty ? "is-dirty" : ""}`} aria-hidden="true" />
            <strong>{fileName(activeDocument.filePath)}</strong>
          </div>
          <span>{pathLabel}</span>
        </div>
        <div className="toolbar">
          <div className="tool-group">
            <button type="button" className="tool-button" onClick={newDoc} disabled={busy} title="New tab (Ctrl+N)">
              <span className="tool-icon" aria-hidden="true">+</span>
              <span>New</span>
            </button>
            <button type="button" className="tool-button" onClick={() => void openDialog()} disabled={busy} title="Open in a new tab (Ctrl+O)">
              <span className="tool-icon" aria-hidden="true">↗</span>
              <span>Open</span>
            </button>
          </div>
          <div className="tool-group">
            <button type="button" className="tool-button primary" onClick={() => void save()} disabled={saveDisabled} title="Save (Ctrl+S)">
              <span className="tool-icon" aria-hidden="true">✓</span>
              <span>Save</span>
            </button>
            <button type="button" className="tool-button" onClick={() => void saveAs()} disabled={busy} title="Save As (Ctrl+Shift+S)">
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
                disabled={busy}
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
              disabled={busy}
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

      <nav className="tabstrip" aria-label="Open documents">
        <div className="tab-list">
          {documents.map((document, index) => {
            const documentDirty = isDirty(document);
            const active = document.id === activeDocument.id;
            const label = fileName(document.filePath);
            return (
              <div key={document.id} className={`document-tab ${active ? "is-active" : ""}`}>
                <button
                  type="button"
                  id={"tab-" + document.id}
                  className="tab-select"
                  aria-pressed={active}
                  aria-label={`${label}${documentDirty ? ", modified" : ""}`}
                  onClick={() => setActiveDocumentId(document.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  disabled={busy}
                >
                  <span className={`tab-dirty-dot ${documentDirty ? "is-dirty" : ""}`} aria-hidden="true" />
                  <span className="tab-label">{label}</span>
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`Close ${label}`}
                  onClick={() => void closeDocument(document.id)}
                  disabled={busy}
                  title={`Close ${label} (Ctrl+W)`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="new-tab-button"
          onClick={newDoc}
          disabled={busy}
          aria-label="New document tab"
          title="New tab (Ctrl+N)"
        >
          +
        </button>
      </nav>

      <div className="subbar">
        <span className={`status-pill ${dirty ? "is-dirty" : ""}`} aria-live="polite" aria-atomic="true">
          {statusText}
        </span>
        <span>{words.toLocaleString()} words</span>
        <span className="tab-count">
          {documents.length} {documents.length === 1 ? "document" : "documents"} open
        </span>
      </div>

      {error ? <div className="error-strip" role="alert">{error}</div> : null}

      {recoveryPrompt ? (
        <div className="recovery-strip" role="status">
          <span>
            {recoveryPrompt.length === 1 ? "Recovery draft found" : `${recoveryPrompt.length} recovery drafts found`}
            {" — "}unsaved changes from a previous session.
          </span>
          <button type="button" className="tool-button primary" onClick={() => void restoreRecovery()} disabled={busy}>
            Restore
          </button>
          <button type="button" className="tool-button" onClick={dismissRecovery} disabled={busy}>
            Dismiss
          </button>
        </div>
      ) : null}

      {documents.map((document) => {
        const active = document.id === activeDocument.id;
        return (
          <section
            key={document.id}
            id={"document-editor-panel-" + document.id}
            className="editor-panel"
            aria-label={"Markdown editor — " + fileName(document.filePath)}
            hidden={!active}
          >
            <DurableEditor
              docKey={positionKey(document)}
              value={document.content}
              onChange={(content) => updateDocument(document.id, (current) => ({ ...current, content }))}
              readOnly={busy}
              livePreview={livePreview}
              placeholderText={document.filePath ? "Write Markdown..." : "Start typing..."}
              ariaLabel={`Markdown editor — ${fileName(document.filePath)}`}
              active={active}
            />
          </section>
        );
      })}

      <footer className="statusbar">
        <span>{dirty ? "Unsaved changes" : "Changes saved"}</span>
        <span>{livePreview ? "Live Preview" : "Raw Markdown"}</span>
      </footer>
    </main>
  );
}
