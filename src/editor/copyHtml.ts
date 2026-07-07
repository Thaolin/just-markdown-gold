// copyHtml.ts — produce text/html clipboard data from the CM6 Markdown buffer.
// ponytail: bold, italic, headings, paragraph/hard-line breaks. The Markdown marks (*, **, #)
// are SUPPRESSED in the HTML output (same as Live Preview hides them visually).
// Blockquotes, lists, HR, links, images, code: deferred until someone misses them.

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

interface TextLine {
  from: number;
  to: number;
  text: string;
}

export function selectionToHtml(
  state: EditorState,
  from: number,
  to: number,
): string {
  const doc = state.doc;
  if (from >= to) return "";

  // ── collect inline marks + ranges to suppress (EmphasisMark, HeaderMark) ──
  const events: MarkEvent[] = [];
  const suppress: Array<[number, number]> = []; // [from, to) — text within is dropped

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
        case "EmphasisMark":
        case "HeaderMark":
          suppress.push([nFrom, nTo]);
          break;
      }
    },
  });

  // closest-first at same position so </em></strong> closes correctly nested marks
  events.sort((a, b) => a.pos - b.pos || (a.type === "close" ? -1 : 1));
  suppress.sort((a, b) => a[0] - b[0]);

  // slice text from [rangeFrom, rangeFrom+prev) to (rangeFrom+e.pos), skipping suppress ranges
  const sliceVisible = (rangeFrom: number, absFrom: number, absTo: number): string => {
    let out = "";
    let pos = absFrom;
    for (const [sFrom, sTo] of suppress) {
      const s = Math.max(sFrom, pos);
      const t = Math.min(sTo, absTo);
      if (s < t) {
        if (s > pos) out += escapeHtml(doc.sliceString(pos, s));
        pos = t;
      }
    }
    if (pos < absTo) out += escapeHtml(doc.sliceString(pos, absTo));
    return out;
  };

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
        parts.push(sliceVisible(rangeFrom, rangeFrom + prev, rangeFrom + e.pos));
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
      parts.push(sliceVisible(rangeFrom, rangeFrom + prev, rangeTo));
    }

    while (stack.length) {
      parts.push(`</${stack.pop()!}>`);
    }

    return parts.join("");
  };

  const hardBreakEnd = (line: TextLine): number => {
    if (/\\$/.test(line.text)) return line.to - 1;
    const trailingSpaces = line.text.match(/ {2,}$/)?.[0].length ?? 0;
    return line.to - trailingSpaces;
  };

  const hasHardBreak = (line: TextLine): boolean => hardBreakEnd(line) < line.to;

  const renderParagraph = (lines: TextLine[]): string => {
    const parts: string[] = [];
    lines.forEach((line, index) => {
      const contentTo = index < lines.length - 1 && hasHardBreak(line) ? hardBreakEnd(line) : line.to;
      const inner = renderInline(line.from, contentTo);
      if (!inner) return;
      if (parts.length) parts.push("<br>");
      parts.push(inner);
    });
    return parts.length ? `<p>${parts.join("")}</p>` : "";
  };

  // ── block-level: blank lines split paragraphs; hard line breaks stay inside the paragraph ──
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);
  const blocks: string[] = [];
  let paragraph: TextLine[] = [];

  const flushParagraph = () => {
    const block = renderParagraph(paragraph);
    if (block) blocks.push(block);
    paragraph = [];
  };

  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = doc.line(n);
    const lineFrom = Math.max(line.from, from);
    const lineTo = Math.min(line.to, to);

    if (lineFrom >= lineTo || !doc.sliceString(lineFrom, lineTo).trim()) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.text.match(/^(#{1,6})\s/);
    if (headingMatch && lineFrom === line.from) {
      flushParagraph();
      const level = headingMatch[1].length;
      const contentFrom = line.from + headingMatch[0].length;
      const contentTo = Math.min(lineTo, line.to);
      if (contentFrom < contentTo) {
        const inner = renderInline(contentFrom, contentTo);
        if (inner) blocks.push(`<h${level}>${inner}</h${level}>`);
      }
    } else {
      paragraph.push({ from: lineFrom, to: lineTo, text: doc.sliceString(lineFrom, lineTo) });
    }
  }

  flushParagraph();

  // If only one block and it's a <p>, strip the wrapper — paste into inline contexts (email, etc.)
  if (blocks.length === 1 && blocks[0].startsWith("<p>")) {
    return blocks[0].slice(3, -4);
  }

  return blocks.join("\n");
}
