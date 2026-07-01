// copyHtml.ts — produce text/html clipboard data from the CM6 Markdown buffer.
// ponytail: bold, italic, headings, paragraph breaks. Add blockquotes/lists/hr when
// copy-paste into Word/Docs proves they're missed.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MarkEvent {
  pos: number;
  type: "open" | "close";
  tag: string;
}

export function selectionToHtml(
  state: EditorState,
  from: number,
  to: number,
): string {
  const doc = state.doc;
  if (from >= to) return "";

  // ── collect inline mark ranges within the selection ──
  const events: MarkEvent[] = [];

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      const nFrom = Math.max(node.from, from);
      const nTo = Math.min(node.to, to);
      if (nFrom >= nTo) return;
      switch (node.name) {
        case "StrongEmphasis":
          events.push({ pos: nFrom, type: "open", tag: "strong" });
          events.push({ pos: nTo, type: "close", tag: "strong" });
          break;
        case "Emphasis":
          events.push({ pos: nFrom, type: "open", tag: "em" });
          events.push({ pos: nTo, type: "close", tag: "em" });
          break;
      }
    },
  });

  // closest-first at same position so <em><strong>text</strong></em> nests correctly
  events.sort((a, b) => a.pos - b.pos || (a.type === "close" ? -1 : 1));

  // ── render inline HTML for a doc range, applying mark events ──
  const renderInline = (rangeFrom: number, rangeTo: number): string => {
    // filter events to this range, adjusting positions relative to rangeFrom
    const local: MarkEvent[] = [];
    for (const e of events) {
      if (e.pos < rangeFrom || e.pos > rangeTo) continue;
      local.push({ ...e, pos: e.pos - rangeFrom });
    }

    const parts: string[] = [];
    let prev = 0;
    const stack: string[] = [];

    for (const e of local) {
      if (e.pos > prev) {
        parts.push(escapeHtml(doc.sliceString(rangeFrom + prev, rangeFrom + e.pos)));
      }
      if (e.type === "open") {
        parts.push(`<${e.tag}>`);
        stack.push(e.tag);
      } else {
        // close matching tag + anything opened after it
        const idx = stack.lastIndexOf(e.tag);
        if (idx >= 0) {
          while (stack.length > idx) {
            parts.push(`</${stack.pop()!}>`);
          }
        }
      }
      prev = e.pos;
    }

    if (rangeTo - rangeFrom > prev) {
      parts.push(escapeHtml(doc.sliceString(rangeFrom + prev, rangeTo)));
    }

    while (stack.length) {
      parts.push(`</${stack.pop()!}>`);
    }

    return parts.join("");
  };

  // ── block-level: split into paragraphs, detect headings ──
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);
  const blocks: string[] = [];

  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = doc.line(n);
    const lineFrom = Math.max(line.from, from);
    const lineTo = Math.min(line.to, to);

    if (lineFrom >= lineTo) continue;

    const headingMatch = line.text.match(/^(#{1,6})\s/);
    if (headingMatch && lineFrom === line.from) {
      const level = headingMatch[1].length;
      const contentFrom = line.from + headingMatch[0].length;
      const contentTo = Math.min(lineTo, line.to);
      if (contentFrom < contentTo) {
        const inner = renderInline(contentFrom, contentTo);
        blocks.push(`<h${level}>${inner}</h${level}>`);
      }
    } else {
      const inner = renderInline(lineFrom, lineTo);
      // Only emit <p> for non-empty lines; blank lines are just spacing
      if (inner) {
        blocks.push(`<p>${inner}</p>`);
      }
    }
  }

  // If only one block and it's a <p>, strip the wrapper — paste into inline contexts (email, etc.)
  if (blocks.length === 1 && blocks[0].startsWith("<p>")) {
    return blocks[0].slice(3, -4); // strip <p> and </p>
  }

  return blocks.join("\n");
}
