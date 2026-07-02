# Handoff - Current Quick Wins

## Current Project State

The repo is on `main` and `v0.3.0` is the final public-polish release: recovery drafts, app-owned recent files, toolbar formatting, View-menu reading preferences, themes, preference sync, a welcome starter document, refreshed docs, and the refreshed Gold Edition icon.

`package.json` reports `0.3.0`, and the latest local packaged installer is `release/Just Markdown Gold Edition Setup 0.3.0.exe`. The generated installer remains ignored by Git and should be attached to the release rather than committed.

### What Ships In `v0.3.0`

| Area | Status |
|---|---|
| **New / Open / Save / Save As** | Working with native dialogs and file-association support |
| **Unsaved-change prompts** | New, Open, file-association open, and window close |
| **Live Preview** | Hand-rolled CM6 plugin hides common syntax marks, renders prose, reveals marks at cursor |
| **Markdown keybindings** | Ctrl+B/I, Ctrl+Alt+1/2/3, Ctrl+Shift+./8/7 |
| **Dirty tracking** | Window title marker, status pill, dirty dot |
| **Cursor/scroll persistence** | Per file via localStorage |
| **Native menu** | File, Edit, View, Help with Recent Files, Find, Live Preview, and About |
| **Recent files** | App-owned list stored in `userData/recent-files.json`, capped at 10, filtered to existing Markdown-ish files |
| **Recovery draft** | Global `userData/recovery-draft.md`, restored only after explicit user opt-in |
| **Paste/copy behavior** | Rich-text paste is stripped to plain text; Markdown copy can include basic HTML |
| **About dialog** | Shows version, tagline, and app icon |
| **File-based logging** | Session-demarcated, auto-trimming log in `userData/markdown-editor.log` |
| **Single-instance lock** | Second-instance file opens route into the existing window |
| **Error capture** | Main errors, renderer load failures, renderer exits, and renderer console messages are logged |
| **Windows installer** | `electron-builder` NSIS with `.md` and `.markdown` file associations |
| **Toolbar formatting** | Buttons for bold, italic, H1-H3, quote, bullet list, numbered list, and Find |
| **Welcome starter document** | New untitled documents start with a short welcome note instead of `# Untitled` |
| **View menu preferences** | Theme, Font Size, and Reading Width radio menus |
| **Themes** | Gold Standard, Midnight, Evergreen, Paper, Power User |
| **Preference persistence** | localStorage-backed theme/font/measure values sync back to native menu checkmarks |
| **Window icon** | Refreshed custom `.ico` included in the app and installer |

## Architecture Decisions To Preserve

- Markdown is the truth: no hidden document model and no WYSIWYG storage format.
- CM6 source buffer remains byte-identical Markdown; Live Preview only decorates visible ranges.
- The IPC bridge uses `contextIsolation: true`, `nodeIntegration: false`, and one preload file exposing `window.markdownFiles`.
- Renderer errors should flow through console logging so the main-process log captures them.
- Local comfort state can live in localStorage; user content and recovery drafts stay in files.
- Avoid dashboards, sidebars, workspace concepts, cloud sync, plugin systems, and account surfaces.

## Next Quick Wins

### 1. Installer Upgrade And Uninstall Verification

**Roadmap fit**: Trust priority, release confidence.

**Current state**: NSIS config exists with `oneClick: false`, `perMachine: false`, and `allowToChangeInstallationDirectory: true`. Recovery drafts, recent files, and logs live under Electron `userData`, so app upgrades should leave them alone.

**Manual QA pass**:

1. Build the installer with `npm run dist`.
2. Install over an existing installed copy.
3. Open and save a Markdown file from Explorer and from the app.
4. Kill the app with unsaved text and verify recovery prompt on next clean launch.
5. Uninstall and verify the app is removed while `userData` behavior is understood and documented.
6. Record findings in `docs/INSTALLER_QA.md` if anything surprising happens.

### 2. Renderer Sandbox Hardening

**Roadmap fit**: Reliability/security hardening.

**Current state**: `BrowserWindow` uses `contextIsolation: true` and `nodeIntegration: false`, but does not set `sandbox: true`.

**What to try**:

```cjs
webPreferences: {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}
```

**Test**: Launch, open/save files, use all menu commands, verify recovery draft IPC, and confirm renderer logs still reach `markdown-editor.log`.

### 3. 0.4.0 Release Hygiene

**Current state**:

- `v0.3.0` tag exists.
- `README.md`, `LICENSE`, `CHANGELOG.md`, logo, icon, and screenshot exist.
- Git remotes are configured:
  - `github` -> `https://github.com/Thaolin/just-markdown-gold.git`
  - `origin` -> local Gitea-style remote
- Local `release/` contains older installer artifacts.

**Next actions**:

- Publish or verify the GitHub Release for `v0.3.0` with the refreshed Windows installer.
- Keep generated installers out of Git.
- Clean local `release/` artifacts when they become confusing; do not treat that folder as source.
- Start `0.4.0` on a new commit after the final `v0.3.0` tag.

## Architecture Reference

```text
electron/
  main.cjs          Window management, IPC handlers, native menu, file ops, recent files, logging
  preload.cjs       contextBridge API exposed as window.markdownFiles

src/
  main.tsx          React entry point and browser fallback install
  App.tsx           Top-level document state, dirty state, recovery UI, toolbar, menu listeners
  browserFallback.ts Browser-mode stubs for window.markdownFiles
  preferences.ts    localStorage-backed editor preference helpers
  global.d.ts       TypeScript declarations for window.markdownFiles
  styles.css        App shell, themes, CM6 overrides, responsive behavior

  editor/
    DurableEditor.tsx  CM6 wrapper: history, search, paste/copy hooks, persistence, Live Preview toggle
    livePreview.ts     CM6 ViewPlugin for Live Preview decorations
    markdownKeymap.ts  Markdown formatting commands and keybindings
    copyHtml.ts        Basic Markdown selection to HTML clipboard conversion
```

## IPC Channel Map

| Channel | Direction | Purpose |
|---|---|---|
| `file:get-pending-open` | Renderer -> Main | Get file path from startup argv or second-instance handoff |
| `file:open-dialog` | Renderer -> Main | Show native open dialog |
| `file:read` | Renderer -> Main | Read file from disk and remember it |
| `file:save` | Renderer -> Main | Write file to known path and clear recovery draft |
| `file:save-as` | Renderer -> Main | Show save dialog, write file, remember it, clear recovery draft |
| `file:open-request` | Main -> Renderer | Ask existing window to open a file from second instance |
| `app:set-dirty` | Renderer -> Main | Track whether close needs an unsaved-change prompt |
| `app:confirm-unsaved` | Renderer -> Main | Show native Save / Don't Save / Cancel dialog |
| `app:close-after-save` | Renderer -> Main | Complete the save-before-close handshake |
| `app:cancel-close-after-save` | Renderer -> Main | Cancel the save-before-close handshake |
| `app:save-before-close` | Main -> Renderer | Ask renderer to save before closing |
| `app:save-recovery-draft` | Renderer -> Main | Write global recovery draft |
| `app:get-recovery-draft` | Renderer -> Main | Read global recovery draft |
| `app:clear-recovery-draft` | Renderer -> Main | Remove global recovery draft |
| `menu:new` / `menu:open` / `menu:save` / `menu:save-as` | Main -> Renderer | File menu item clicked |
| `menu:find` / `menu:toggle-preview` | Main -> Renderer | Edit/View menu item clicked |
| `menu:set-font-size` / `menu:set-reading-width` / `menu:set-theme` | Main -> Renderer | View preference menu item clicked |
| `menu:open-recent` | Main -> Renderer | Recent file clicked |
| `menu:set-live-preview` | Renderer -> Main | Sync Live Preview checkbox state |
| `menu:set-editor-preferences` | Renderer -> Main | Sync persisted preferences to native menu state |
| `console-message` | Renderer -> Main | Capture renderer console output in the log |

## Dev Commands

```powershell
npm run dev       # Vite + Electron concurrently
npm run build     # TypeScript + Vite build
npm run dist      # Build + electron-builder NSIS installer
npm run start     # Launch through Electron
```

Log file location: `%APPDATA%/just-markdown/markdown-editor.log`
