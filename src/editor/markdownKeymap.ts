// markdownKeymap.ts — Markdown formatting keyboard commands for the manuscript editor.
// Transforms the CM6 buffer (byte-identical Markdown stays on disk); never writes hidden state.
import { EditorSelection, type ChangeSpec } from "@codemirror/state"
import type { EditorView, KeyBinding } from "@codemirror/view"

type Cmd = (view: EditorView) => boolean
export type MarkdownCommand = "bold" | "italic" | "h1" | "h2" | "h3" | "quote" | "bulletList" | "numberedList"

function selectionEndLine(view: EditorView, from: number, to: number) {
  const lineAtEnd = view.state.doc.lineAt(to)
  return from !== to && to === lineAtEnd.from
    ? view.state.doc.lineAt(to - 1)
    : lineAtEnd
}

// Wrap selection with `mark` / unwrap if already wrapped / insert paired marks with cursor inside.
// Known v1 edge: selecting `**bold**` then Ctrl+I strips one layer → `*bold*`. Acceptable.
function toggleInlineMark(mark: string): Cmd {
  return (view) => {
    const { state } = view
    view.dispatch(
      state.changeByRange((range) => {
        if (range.empty) {
          return {
            changes: { from: range.from, insert: mark + mark },
            range: EditorSelection.cursor(range.from + mark.length),
          }
        }
        const text = state.sliceDoc(range.from, range.to)
        if (text.startsWith(mark) && text.endsWith(mark) && text.length >= mark.length * 2 + 1) {
          const inner = text.slice(mark.length, text.length - mark.length)
          return {
            changes: { from: range.from, to: range.to, insert: inner },
            range: EditorSelection.range(range.from, range.from + inner.length),
          }
        }
        return {
          changes: [
            { from: range.from, insert: mark },
            { from: range.to, insert: mark },
          ],
          range: EditorSelection.range(range.from, range.to + mark.length * 2),
        }
      })
    )
    return true
  }
}

// Toggle heading prefix on each selected line. Same level → remove; different → replace; none → add.
function toggleHeading(level: 1 | 2 | 3): Cmd {
  return (view) => {
    const { state } = view
    const prefix = "#".repeat(level) + " "
    const changes: ChangeSpec[] = []
    const seen = new Set<number>()
    for (const range of state.selection.ranges) {
      const startLine = state.doc.lineAt(range.from)
      const endLine = selectionEndLine(view, range.from, range.to)
      for (let n = startLine.number; n <= endLine.number; n++) {
        if (seen.has(n)) continue
        seen.add(n)
        const line = state.doc.line(n)
        const m = line.text.match(/^(#{1,6}) /)
        if (m) {
          changes.push(
            m[1].length === level
              ? { from: line.from, to: line.from + m[0].length, insert: "" }
              : { from: line.from, to: line.from + m[0].length, insert: prefix }
          )
        } else {
          changes.push({ from: line.from, insert: prefix })
        }
      }
    }
    if (changes.length) view.dispatch(state.update({ changes, scrollIntoView: true }))
    return true
  }
}

// Toggle a line-start prefix (>, - , 1. ) on selected lines. All-have → remove all; else add to missing.
function toggleLinePrefix(prefix: string): Cmd {
  return (view) => {
    const { state } = view
    const seen = new Set<number>()
    const lines: Array<{ from: number; hasPrefix: boolean }> = []
    for (const range of state.selection.ranges) {
      const startLine = state.doc.lineAt(range.from)
      const endLine = selectionEndLine(view, range.from, range.to)
      for (let n = startLine.number; n <= endLine.number; n++) {
        if (seen.has(n)) continue
        seen.add(n)
        const line = state.doc.line(n)
        lines.push({ from: line.from, hasPrefix: line.text.startsWith(prefix) })
      }
    }
    const allHave = lines.every((l) => l.hasPrefix)
    const changes: ChangeSpec[] = lines.flatMap(({ from, hasPrefix }) => {
      if (allHave) return [{ from, to: from + prefix.length, insert: "" }]
      if (!hasPrefix) return [{ from, insert: prefix }]
      return []
    })
    if (changes.length) view.dispatch(state.update({ changes, scrollIntoView: true }))
    return true
  }
}

const markdownCommands: Record<MarkdownCommand, Cmd> = {
  bold: toggleInlineMark("**"),
  italic: toggleInlineMark("*"),
  h1: toggleHeading(1),
  h2: toggleHeading(2),
  h3: toggleHeading(3),
  quote: toggleLinePrefix("> "),
  bulletList: toggleLinePrefix("- "),
  numberedList: toggleLinePrefix("1. "),
}

export function runMarkdownCommand(view: EditorView, command: MarkdownCommand): boolean {
  return markdownCommands[command](view)
}

export const markdownKeybindings: KeyBinding[] = [
  { key: "Ctrl-b", mac: "Cmd-b", run: markdownCommands.bold, preventDefault: true },
  { key: "Ctrl-i", mac: "Cmd-i", run: markdownCommands.italic, preventDefault: true },
  { key: "Ctrl-Alt-1", run: markdownCommands.h1, preventDefault: true },
  { key: "Ctrl-Alt-2", run: markdownCommands.h2, preventDefault: true },
  { key: "Ctrl-Alt-3", run: markdownCommands.h3, preventDefault: true },
  { key: "Ctrl-Shift-.", run: markdownCommands.quote, preventDefault: true },
  { key: "Ctrl-Shift-8", run: markdownCommands.bulletList, preventDefault: true },
  { key: "Ctrl-Shift-7", run: markdownCommands.numberedList, preventDefault: true },
]
