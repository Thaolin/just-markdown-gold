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

## 0.3.0 Docket

1. Commit Current Polish
   - Word count.
   - Narrower reading measure.
   - Better reading font and margins.

2. Installer And Version Hygiene
   - Remove old `Markdown Editor Setup 0.1.0.exe` artifacts from `release/`.
   - Decide whether `release/` stays ignored or whether GitHub releases carry installers only.

3. File-Open Confidence Pass
   - File menu Open.
   - Toolbar Open.
   - Double-click `.md`.
   - Right-click Open With.
   - Second file while app is already running.
   - Recent files menu.

4. Recovery Confidence Pass
   - Crash or kill with unsaved text.
   - Restore.
   - Dismiss.
   - Open real file while recovery strip exists.
   - New document while recovery strip exists.
   - Save As cancel during close.

5. Basic Settings, Maybe
   - No settings screen yet.
   - Menu-level toggles only if they earn their keep:
     - Live Preview, already there.
     - Font size: Smaller / Default / Larger.
     - Reading width: Narrow / Standard / Wide.

6. Tiny Public Repo Polish
   - Add LICENSE.
   - Add CHANGELOG.md.
   - Make the README a bit more unhinged, in the "Just a freakin' Markdown editor GOLD EDITION" spirit.
   - Add the logo to the README.
   - Add a screenshot to the README once the right shot exists.
   - Tag `v0.3.0`.
   - Upload installer to GitHub release.

7. Deferred / Maybe Pile
   - Auto-update, so an installed copy can quietly keep up with small fixes.
   - Per-file recovery.
   - Better link/image HTML copy.
   - More Markdown constructs in Live Preview.

## 0.4.0 Docket

1. macOS And Linux Packaging
   - Add explicit package scripts:
     - `dist:win`
     - `dist:mac`
     - `dist:linux`
     - `dist:all`
   - Add GitHub Actions release builds:
     - Windows runner builds NSIS `.exe`.
     - macOS runner builds `.dmg` and `.zip`.
     - Ubuntu runner builds AppImage and Flatpak bundle.
   - Add macOS packaging assets:
     - `.icns` icon.
     - File association metadata for `.md` and `.markdown`.
     - Unsigned local build first, signing and notarization later.
   - Add Linux packaging assets:
     - AppImage for the easiest first Linux download.
     - Flatpak bundle for the "probably runs on your fridge" bit.
     - Linux icon sizes, `.desktop` metadata, and Markdown MIME associations.
   - Update README with a platform table and release artifact notes.

2. Full UI Pass With Impeccable
   - Treat the app as a restrained product UI: familiar controls, low ceremony, fast task flow.
   - Audit the full shell:
     - Top bar hierarchy.
     - Toolbar button states.
     - Status/substatus bars.
     - Recovery strip.
     - Empty/new document state.
     - Recent files and native menu copy.
     - Focus states and keyboard-first use.
     - Narrow, normal, and ultrawide layout behavior.
   - Tighten visual rules:
     - Consistent button vocabulary.
     - Clear hover, active, focus, disabled, and loading states.
     - No decorative panels, fake dashboards, or feature theater.
     - Keep the writing surface sincere even while the repo voice gets ridiculous.
   - Verify with screenshots before shipping.

3. Platform Reality Notes
   - Android is not an Electron packaging target.
   - Keep Android / WebView / smartfridge as a future experiment, not part of 0.4.0.
   - Marketing line can be funny; support matrix should stay honest.

## Maybe Later

- Auto-update, so an installed copy can quietly keep up with small fixes.
- Android or WebView companion experiment.
- Smaller-runtime investigation if Electron install size becomes a real blocker.

## Public Repo Checklist

- README with the simple positioning.
- Screenshot.
- LICENSE.
- CHANGELOG.md.
- GitHub release with Windows installer.
- GitHub remote plus Gitea mirror remote.
- Tag the first public release as `v0.3.0`.
