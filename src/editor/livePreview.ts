// livePreview.ts — W2b: Obsidian-style "Live Preview" decorations over the Markdown SOURCE buffer.
//
// THE ARCHITECTURAL LINE (do NOT "improve" this into a document model — W2 plan §2): this is a
// RENDER LAYER, not a storage format. The CM6 doc stays the byte-identical Markdown string. The
// plugin only ever produces DecorationSets + atomic ranges; it NEVER dispatches a document change.
// So files-are-truth (#1), provenance.sha256_text, the expected_sha256 patch base, and pandoc→docx
// all stay intact. Copy-out yields raw Markdown (CM serializes the doc text, not the rendered DOM /
// widget glyphs). The only doc mutations come from the author's own keystrokes via onChange→save.
//
// There is NO turnkey "Obsidian Live Preview for CM6" package (Obsidian's is proprietary, HyperMD is
// CM5), so this is a hand-rolled ViewPlugin (W2 plan §5) that walks @lezer/markdown's tree over the
// VISIBLE ranges only and, on every doc/viewport/selection change:
//   • HIDES syntax marks   — Decoration.replace over EmphasisMark / HeaderMark / QuoteMark / bullet ListMark
//   • STYLES the content    — Decoration.mark over StrongEmphasis/Emphasis/ATXHeading*; Decoration.line for blockquotes
//   • DRAWS the scene break — Decoration.replace + an INLINE WidgetType over a HorizontalRule (block widgets
//                             would require a StateField; an inline widget is plugin-legal)
//   • REVEALS the raw marks where the cursor/selection sits — inline-node granularity for emphasis,
//                             line granularity for headings / blockquotes / lists / hr (so you edit raw marks)
//   • marks the hidden ranges ATOMIC so arrow keys step over a hidden ** instead of landing inside it.
//
// SCOPE (W2 plan §3) — the prose subset ONLY: bold, italic, headings, blockquote, scene-break/hr,
// bullet + numbered lists. Numbered lists keep their digits (the number is information); bullets get a
// rendered glyph. Nothing else (no tables/footnotes/wikilinks/embeds/code-block highlighting/checkboxes).
//
// CM6 constraints honored (why the code looks the way it does):
//   - Plugin mark decorations may NOT span line breaks → emphasis marks are clipped per line (markClipped).
//   - Plugin replace decorations may NOT cover a line-ending newline → every hide is mid-line (marks) or
//     over the HR text only (which excludes its newline).
//   - Block widgets must come from a StateField → the HR widget is INLINE.

import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { type EditorState, type Extension, type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// ----- widgets (inline; reused instances — eq() returns true so CM never rebuilds them) -----

// A static inline glyph that replaces a raw mark — the scene break "* * *" or the bullet "•". One class,
// two constant instances (below); eq() compares (cls,text) so CM only rebuilds when those change (never,
// since they're constants).
class GlyphWidget extends WidgetType {
  readonly cls: string;
  readonly text: string;
  constructor(cls: string, text: string) {
    super();
    this.cls = cls;
    this.text = text;
  }
  eq(other: GlyphWidget) {
    return other.cls === this.cls && other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.cls;
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
}

// ----- reusable decoration values (stateless — safe to share across ranges) -----
const HIDE = Decoration.replace({});
const BOLD = Decoration.mark({ class: "cm-md-bold" });
const ITALIC = Decoration.mark({ class: "cm-md-italic" });
const REVEAL = Decoration.mark({ class: "cm-md-mark" }); // dims the syntax marks while revealed
const HEADING = [1, 2, 3, 4, 5, 6].map((n) => Decoration.mark({ class: `cm-md-h${n}` }));
const QUOTE_LINE = Decoration.line({ class: "cm-md-quote-line" });
// The scene break renders a typed-manuscript "* * *" (always shows, unlike an asterism glyph that can
// tofu in a serif fallback); the bullet replaces the raw -/*/+ marker.
const SCENE_BREAK = Decoration.replace({ widget: new GlyphWidget("cm-md-hr", "* * *") });
const BULLET = Decoration.replace({ widget: new GlyphWidget("cm-md-bullet", "•") });

const BULLET_MARK = /^[-*+]$/; // a bullet ListMark vs. an ordered "1." ListMark

// Pure decoration computation over the given ranges (the plugin passes view.visibleRanges; the
// headless test passes the whole doc). No DOM / view dependency, so the exact production logic is
// unit-testable against the real Lezer tree. Render-only: produces RangeSets, never mutates the doc.
export function buildDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[]
): { decorations: DecorationSet; atomic: RangeSet<Decoration> } {
  const decos: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const doc = state.doc;

  // inline granularity: does the selection touch [from,to]? (inclusive, so cursor-adjacent reveals)
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);

  // line granularity: does the selection touch the line at `pos`? (block marks are revealed per-line)
  const lineTouched = (pos: number) => {
    const line = doc.lineAt(pos);
    return sel.some((r) => r.from <= line.to && r.to >= line.from);
  };

  // Hide a mid-line range (and register it as atomic so the caret steps over it).
  const hide = (from: number, to: number, replacement: Decoration = HIDE) => {
    if (from >= to) return;
    decos.push(replacement.range(from, to));
    atomic.push(HIDE.range(from, to)); // atomic value is irrelevant; reuse HIDE
  };

  // Reveal a raw mark (the cursor is on/in it, so you can edit it) or hide it — optionally replaced by
  // a rendered glyph (bullet / scene break). The reveal/hide range is the same; only the test differs.
  const revealOrHide = (reveal: boolean, from: number, to: number, replacement?: Decoration) => {
    if (reveal) decos.push(REVEAL.range(from, to));
    else hide(from, to, replacement);
  };

  // Add a mark, CLIPPED at line boundaries (plugin marks may not span a line break).
  const markClipped = (from: number, to: number, deco: Decoration) => {
    if (from >= to) return;
    let pos = from;
    while (pos < to) {
      const line = doc.lineAt(pos);
      const end = Math.min(to, line.to);
      if (end > pos) decos.push(deco.range(pos, end));
      pos = line.to + 1; // step past the newline
    }
  };

  // Eat one trailing space after a block mark so "# " / "> " collapse cleanly.
  const eatSpace = (pos: number) => (doc.sliceString(pos, pos + 1) === " " ? pos + 1 : pos);

  for (const range of ranges) {
    // expand to whole lines so a node clipped at the viewport edge still gets all its marks
    const from = doc.lineAt(range.from).from;
    const to = doc.lineAt(range.to).to;
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        switch (node.name) {
          case "StrongEmphasis":
            markClipped(node.from, node.to, BOLD);
            break;
          case "Emphasis":
            markClipped(node.from, node.to, ITALIC);
            break;
          case "EmphasisMark": {
            // reveal at the inline-node granularity of the parent Emphasis/StrongEmphasis
            const span = node.node.parent ?? node.node;
            revealOrHide(touches(span.from, span.to), node.from, node.to);
            break;
          }
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6":
            markClipped(node.from, node.to, HEADING[Number(node.name.slice(-1)) - 1]);
            break;
          case "HeaderMark": {
            // ATX only. A setext underline (===/---) is ALSO a HeaderMark; we don't style setext
            // headings, so leave those marks alone rather than hiding them under unstyled text.
            const parentName = node.node.parent?.name;
            if (!parentName || !parentName.startsWith("ATXHeading")) break;
            const end = eatSpace(node.to); // hide "#"/"##"… + one trailing space
            revealOrHide(lineTouched(node.from), node.from, end);
            break;
          }
          case "QuoteMark": {
            const end = eatSpace(node.to);
            revealOrHide(lineTouched(node.from), node.from, end);
            break;
          }
          case "Blockquote": {
            // a left rule + muted treatment on every line of the quote (line decorations are plugin-legal)
            for (let p = node.from; p <= node.to; ) {
              const line = doc.lineAt(p);
              decos.push(QUOTE_LINE.range(line.from));
              p = line.to + 1;
            }
            break;
          }
          case "ListMark": {
            const text = doc.sliceString(node.from, node.to);
            if (!BULLET_MARK.test(text)) break; // ordered list: keep the "1." digits visible
            revealOrHide(lineTouched(node.from), node.from, node.to, BULLET);
            break;
          }
          case "HorizontalRule":
            revealOrHide(touches(node.from, node.to), node.from, node.to, SCENE_BREAK);
            break;
        }
      },
    });
  }

  return { decorations: Decoration.set(decos, true), atomic: RangeSet.of(atomic, true) };
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    atomic: RangeSet<Decoration> = RangeSet.empty;
    constructor(view: EditorView) {
      this.rebuild(view);
    }
    rebuild(view: EditorView) {
      const built = buildDecorations(view.state, view.visibleRanges);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(u: ViewUpdate) {
      // Recompute over the visible ranges on doc / viewport / selection (reveal) change, AND when the
      // background parser advances the syntax tree. That advance arrives as an EFFECT-ONLY transaction
      // (none of the other flags set), so without the syntaxTree check a long chapter renders raw past
      // the ~3000-char initial-parse budget until the next keystroke/scroll. Mirrors CM6's own
      // fold-gutter / TreeHighlighter pattern; the tree object is identity-stable so the check is O(1).
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.rebuild(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  }
);

// The full Live-Preview extension: the Markdown parser + the decoration plugin. The parser is configured
// to add NO editing behavior we don't want — no markdown keymap, no `<`-triggered HTML-tag completion, no
// paste-URL-as-link. (lang-markdown still installs HTML tag auto-close, which only fires when an author
// types a literal `<tag>` — vanishingly rare in prose; if it does, it's a normal user edit that flows
// through onChange→save, so files-are-truth / byte-identity still hold.)
export function markdownLivePreview(): Extension {
  return [
    markdown({ addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }),
    livePreviewPlugin,
  ];
}
