import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { markdownLivePreview } from "./livePreview";
import { markdownKeybindings } from "./markdownKeymap";
import { selectionToHtml } from "./copyHtml";

export interface DurableEditorProps {
  value: string;
  onChange: (value: string) => void;
  docKey: string;
  readOnly?: boolean;
  livePreview?: boolean;
}

interface SavedPos {
  anchor: number;
  head: number;
  topPos?: number;
}

const POS_PREFIX = "markdown-editor.pos.";

function editableState(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function markdownMode(livePreview: boolean): Extension {
  return livePreview
    ? markdownLivePreview()
    : markdown({ addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false });
}

function loadPos(key: string): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_PREFIX + key);
    return raw ? (JSON.parse(raw) as SavedPos) : null;
  } catch {
    return null;
  }
}

function savePos(key: string, pos: SavedPos): void {
  try {
    localStorage.setItem(POS_PREFIX + key, JSON.stringify(pos));
  } catch {
    /* Position is comfort state only. */
  }
}

function topDocPos(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect();
  return view.posAtCoords({ x: rect.left + 4, y: rect.top + 4 }, false);
}

function saveViewPos(view: EditorView, key: string): void {
  const sel = view.state.selection.main;
  savePos(key, { anchor: sel.anchor, head: sel.head, topPos: topDocPos(view) });
}

function restoreTopScroll(view: EditorView, topPos: number, attemptsLeft: number, lastTop: number): void {
  if (!view.dom.isConnected) return;
  view.dispatch({ effects: EditorView.scrollIntoView(topPos, { y: "start" }) });
  view.requestMeasure({
    key: "markdown-editor-restore-scroll",
    read: (v) => v.scrollDOM.scrollTop,
    write: (curTop) => {
      if (attemptsLeft <= 0 || curTop === lastTop) return;
      window.requestAnimationFrame(() => restoreTopScroll(view, topPos, attemptsLeft - 1, curTop));
    },
  });
}

function applySavedPos(view: EditorView, key: string, doc: string): void {
  const pos = loadPos(key);
  if (!pos) return;
  const clamp = (n: number) => Math.min(Math.max(n, 0), doc.length);
  const top = clamp(pos.topPos ?? pos.anchor);
  view.dispatch({ selection: { anchor: clamp(pos.anchor), head: clamp(pos.head) } });
  restoreTopScroll(view, top, 12, -1);
}

let currentEditorView: EditorView | null = null;

export function findInEditor(): void {
  if (currentEditorView) openSearchPanel(currentEditorView);
}

export default function DurableEditor({
  value,
  onChange,
  docKey,
  readOnly = false,
  livePreview = true,
}: DurableEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const editableRef = useRef(new Compartment());
  const markdownRef = useRef(new Compartment());
  const persistTimer = useRef<number | null>(null);

  onChangeRef.current = onChange;

  function persistCurrent(view: EditorView): void {
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      saveViewPos(view, docKey);
    }, 300);
  }

  function cancelPersist(): void {
    if (persistTimer.current != null) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
  }

  function buildState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of(markdownKeybindings),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        markdownRef.current.of(markdownMode(livePreview)),
        placeholder("Write Markdown..."),
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        editableRef.current.of(editableState(readOnlyRef.current)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          if (u.docChanged || u.selectionSet) persistCurrent(u.view);
        }),
        EditorView.domEventHandlers({
          scroll: (_event, view) => persistCurrent(view),
          paste: (event, view) => {
            // ponytail: strip rich-text HTML, keep only plain text — Markdown stays Markdown
            const html = event.clipboardData?.getData("text/html");
            if (!html) return false;
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") ?? "";
            view.dispatch(view.state.replaceSelection(text));
            return true;
          },
          copy: (event, view) => {
            const sel = view.state.selection.main;
            if (sel.empty) return false; // let browser handle (e.g. copy in search panel)
            const html = selectionToHtml(view.state, sel.from, sel.to);
            if (!html) return false;
            event.preventDefault();
            event.clipboardData?.setData("text/plain", view.state.sliceDoc(sel.from, sel.to));
            event.clipboardData?.setData("text/html", html);
            return true;
          },
        }),
      ],
    });
  }

  function swapState(view: EditorView, state: EditorState): void {
    view.setState(state);
    view.dispatch({ effects: editableRef.current.reconfigure(editableState(readOnlyRef.current)) });
  }

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({ state: buildState(value), parent: hostRef.current });
    viewRef.current = view;
    currentEditorView = view;
    applySavedPos(view, docKey, value);
    return () => {
      cancelPersist();
      saveViewPos(view, docKey);
      view.destroy();
      viewRef.current = null;
      if (currentEditorView === view) currentEditorView = null;
    };
    // Remount per document key; current value is the initial file bytes for that mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    swapState(view, buildState(value));
    applySavedPos(view, docKey, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, docKey]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    const view = viewRef.current;
    if (view) view.dispatch({ effects: editableRef.current.reconfigure(editableState(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: markdownRef.current.reconfigure(markdownMode(livePreview)) });
  }, [livePreview]);

  return <div className="editor-host" ref={hostRef} />;
}
