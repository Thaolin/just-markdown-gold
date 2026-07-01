# Product Plan

## Positioning

Just Markdown: Gold Edition is a simple, lightweight WYSIWYG-ish Markdown editor for Windows.

The joke is that the Markdown app ecosystem is crowded with tools trying to become the One True Knowledge System. This app is not doing that. It opens Markdown files, lets you edit them comfortably, saves them honestly, and gets out of the way.

## Product Boundary

The product boundary is deliberately narrow:

- Local files are the source of truth.
- Markdown remains plain Markdown on disk.
- The editor should feel calm and direct.
- Windows desktop behavior matters more than feature breadth.
- Reliability beats novelty.

## Anti-Goals

Do not turn this into:

- A notes vault.
- A graph app.
- A workspace manager.
- A plugin platform.
- An AI writing suite.
- A publishing system.
- A cloud sync product.

## Near-Term Priorities

1. Trust
   - Unsaved-change handling.
   - Crash recovery draft.
   - Recent files.
   - Installer upgrade and uninstall sanity checks.
   - File association behavior for `.md` and `.markdown`.

2. Desktop Manners
   - Basic native menu: File, Edit, View, Help.
   - Standard accelerators for open, save, save as, new, find, undo, redo, cut, copy, paste.
   - About dialog with the Gold Edition identity.

3. Small Editor Improvements
   - Keep Live Preview predictable.
   - Improve paste behavior only where it preserves plain Markdown.
   - Style common Markdown constructs cleanly.
   - Avoid adding modes, sidebars, or workflows unless daily use demands them.

## Maybe Later

- Auto-update, so an installed copy can quietly keep up with small fixes.

## Public Repo Checklist

- README with the simple positioning.
- Screenshot.
- LICENSE.
- CHANGELOG.md.
- GitHub release with Windows installer.
- GitHub remote plus Gitea mirror remote.
- Tag the first public release as `v0.1.0`.
