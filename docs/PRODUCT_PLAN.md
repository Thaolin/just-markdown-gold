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
   - Unsaved-change handling: shipped.
   - Crash recovery draft: shipped.
   - Recent files: shipped with app-owned recent-file storage.
   - Installer upgrade and uninstall sanity checks.
   - File association behavior for `.md` and `.markdown`: configured and needs recurring install QA.

2. Desktop Manners
   - Basic native menu: File, Edit, View, Help: shipped.
   - Standard accelerators for open, save, save as, new, find, undo, redo, cut, copy, paste: shipped.
   - About dialog with the Gold Edition identity: shipped.

3. Small Editor Improvements
   - Keep Live Preview predictable.
   - Improve paste behavior only where it preserves plain Markdown: shipped for rich-text paste.
   - Style common Markdown constructs cleanly.
   - Avoid adding modes, sidebars, or workflows unless daily use demands them.

## 0.3.0 Final

1. Public Release Polish
   - Word count.
   - Narrower reading measure.
   - Better reading font and margins.
   - README, logo, screenshot, changelog, and MIT license.
   - App metadata bumped to `0.3.0`.
   - Refreshed Gold Edition app icon.
   - `v0.3.0` tag points at the final 0.3.0 commit.

2. File-Open Confidence
   - File menu Open.
   - Toolbar Open.
   - Double-click `.md`.
   - Right-click Open With.
   - Second file while app is already running.
   - Recent files menu.

3. Recovery Confidence
   - Crash or kill with unsaved text.
   - Restore.
   - Dismiss.
   - Open real file while recovery strip exists.
   - New document while recovery strip exists.
   - Save As cancel during close.

4. Installer And Version Hygiene
   - Windows NSIS installer builds locally under `release/`.
   - `release/` remains ignored; installers should be published through GitHub Releases instead of committed.
   - Old local installer artifacts may still exist on disk and can be cleaned manually when they get noisy.

5. Direct Toolbar Actions
   - File actions stay visible: New, Open, Save, Save As.
   - Formatting buttons wrap or toggle plain Markdown for bold, italic, H1-H3, block quote, bullet list, and numbered list.
   - Find is available from the toolbar and native menu.
   - Toolbar clicks preserve the editor selection before running formatting commands.

6. Menu-Level Reading Preferences
   - No settings screen yet.
   - Live Preview stays as a toolbar toggle and View menu checkbox.
   - Font size: Smaller / Default / Larger.
   - Reading width: Narrow / Standard / Wide.
   - Theme: Gold Standard / Midnight / Evergreen / Paper / Power User.
   - Preferences persist in localStorage and sync back to native menu checkmarks.

7. Empty/New Document State
   - The first starter document says welcome, open a file, or start typing.
   - New untitled documents after that are blank and titled `Untitled.md`.
   - Still no dashboard, side panel, modal, or onboarding tour.

## 0.4.0 Docket

1. macOS And Linux Packaging
   - Add explicit package scripts:
     - `dist:win`: added.
     - `dist:mac`: added.
     - `dist:linux`: added.
     - `dist:all`: added.
   - Add GitHub Actions release builds:
     - Windows runner builds NSIS `.exe`: added.
     - macOS runner builds `.dmg` and `.zip`: added.
     - Ubuntu runner builds AppImage and Flatpak bundle: added.
   - Add macOS packaging assets:
     - `.icns` icon generated in CI from `build/icon.png`.
     - File association metadata for `.md` and `.markdown`: added.
     - Unsigned local build first, signing and notarization later.
   - Add Linux packaging assets:
     - AppImage for the easiest first Linux download: added.
     - Flatpak bundle for the "probably runs on your fridge" bit: added.
     - Linux icon and Markdown MIME associations: added through `electron-builder`.
   - Update README with a platform table and release artifact notes: added.

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
- Per-file recovery.
- Better link/image HTML copy.
- More Markdown constructs in Live Preview.
- Android or WebView companion experiment.
- Smaller-runtime investigation if Electron install size becomes a real blocker.

## Public Repo Checklist

- README with the simple positioning: done.
- Screenshot: done for `0.3.0`; refresh again if the toolbar/theme UI needs a final public screenshot.
- LICENSE: done.
- CHANGELOG.md: done.
- Git remotes: GitHub remote plus local Gitea-style `origin` remote are configured.
- Tag the first public release as `v0.3.0`: done.
- GitHub release with Windows installer: publish/verify outside the repo if not already done.
