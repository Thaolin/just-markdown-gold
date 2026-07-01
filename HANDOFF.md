# Handoff — Next Quick Wins

## Current Project State (v0.1.0)

### What ships in this build

| Area | Status |
|---|---|
| **New / Open / Save / Save As** | ✅ Working — native dialogs, file-association support |
| **Unsaved-change prompts** | ✅ All four triggers: New, Open, file-association open, window close |
| **Live Preview** | ✅ Hand-rolled CM6 plugin — hides syntax marks, renders prose, reveals at cursor |
| **Markdown keybindings** | ✅ Ctrl+B/I, Ctrl+Alt+1/2/3, Ctrl+Shift+./8/7 |
| **Dirty tracking + title dot** | ✅ Window title, status pill, dirty dot |
| **Cursor/scroll persistence** | ✅ Per-file via localStorage |
| **Native menu** | ✅ File (New/Open/Save/SaveAs/Recent/Exit), Edit (Undo/Redo/Cut/Copy/Paste/SelectAll/Find), View (Live Preview), Help (About) |
| **Recent files** | ✅ Uses Electron `app.addRecentDocument()` + `app.getRecentDocuments()` |
| **About dialog** | ✅ Shows version, tagline, icon |
| **File-based logging** | ✅ Session-demarcated, auto-trimming log in `userData` |
| **Single-instance lock** | ✅ Prevents duplicate windows |
| **Error capture** | ✅ `uncaughtException`, `unhandledRejection`, `did-fail-load`, `render-process-gone`, `console-message` all logged |
| **Windows installer** | ✅ `electron-builder` NSIS with file associations |
| **Window icon** | ✅ Custom .ico baked into build |

### Key architecture decisions (preserve these)

- **Markdown is the truth** — no hidden state, no document model, no WYSIWYG storage format
- **CM6 source buffer is byte-identical Markdown** — the Live Preview plugin only produces `DecorationSet` ranges, never dispatches doc changes
- **IPC bridge** — `contextIsolation: true`, single preload (`preload.cjs`) exposing `window.markdownFiles` methods
- **Logging** — single capture path via `console-message` listener in main process; renderer errors use `console.error`; log auto-trims to ~10K lines
- **No sandbox on BrowserWindow** — pre-existing; adding it would break the preload bridge pattern

---

## Quick Wins — Ordered by Effort & Impact

### 1. Crash Recovery Draft ⭐ Highest Priority

**Roadmap fit**: Trust priority #1, Daily-Driver function

**What to do**: Save a recovery draft to `userData` whenever the editor has unsaved changes. On startup, if a recovery draft exists AND there's no file opened via argv/association, offer to restore.

**Implementation sketch**:

```
main.cjs changes:
  - Recovery path: path.join(app.getPath("userData"), "recovery-draft.md")
  - New IPC "app:save-recovery-draft" handler — writes content to recovery path
  - New IPC "app:get-recovery-draft" — reads and returns content (or null)
  - New IPC "app:clear-recovery-draft" — deletes the file
  - Auto-save recovery on window close / crash (debounced)

App.tsx changes:
  - On mount, check for recovery draft if no file is being opened
  - Show "Recovery draft found" UI (a notice bar, not a modal — keep it calm)
  - Debounced recovery save when content changes while dirty
```

**Files to touch**: `main.cjs`, `preload.cjs`, `global.d.ts`, `App.tsx`, `browserFallback.ts`

**Risks**: Don't overwrite the user's actual file with recovery content. The recovery draft should ONLY be loaded when the user explicitly opts in. Clear it on successful save or explicit discard.

---

### 2. Empty-File / First-Run State

**Roadmap fit**: Daily-Driver function, polish

**Current behavior**: On fresh launch (no argv file), shows `# Untitled\n\n` as the editor content. The placeholder "Write Markdown..." text shows in the empty editor.

**What to make better**: A calm welcome state that introduces the app's personality without being a dashboard. Something subtle — maybe a centered message in the editor area that fades when you start typing.

**Implementation sketch**:

```
Keep it simple — no startup screen, no modal. Two options:

Option A (leanest): Replace the CM placeholder text with a multi-line
greeting in the initial empty doc:
  # Welcome to Just Markdown: Gold Edition
  Open a file or start typing.

  The Markdown editor arms race is over. This one opens files.

Option B (slightly more polish): Use CM's placeholder extension with
styled HTML. Already imported — just customize the text and styling.
```

**Files to touch**: `App.tsx` (EMPTY_DOC constant) or `DurableEditor.tsx` (placeholder string)

**Risks**: None. Don't over-build this — it should not become a startup dashboard.

---

### 3. Paste as Plain Markdown

**Roadmap fit**: Priority 3 — Small Editor Improvements

**Current behavior**: CM6's default paste handler pastes whatever is in the clipboard. If you copy rich text from a browser, the paste may include HTML fragments that CM6's Markdown parser processes unpredictably.

**What to do**: Intercept paste events in CM6 and strip rich text formatting, leaving only plain text. The user pastes Markdown source always.

**Implementation sketch**:

```
In DurableEditor.tsx, add to the editor extensions:

EditorView.domEventHandlers({
  paste: (event, view) => {
    // Only intercept if there's rich text in the clipboard
    const html = event.clipboardData?.getData("text/html");
    if (!html) return false; // let plain-text paste through normally
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    view.dispatch(view.state.replaceSelection(text));
    return true;
  },
})
```

**Files to touch**: `DurableEditor.tsx` only

**Risks**: Minimal. Keep the `text/html` check so plain-text-only pastes (from code editors, terminals) pass through unmodified — those are already clean Markdown.

---

### 4. Installer Upgrade & Uninstall Verification

**Roadmap fit**: Trust priority #1, Daily-Driver function

**Current state**: `electron-builder` NSIS config exists with `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`. But there's no verification that upgrades preserve user data (recovery drafts, log files go to `userData`, which is separate — so they should survive).

**What to do**: Verify the installer behavior:

1. **Build and install** — run `npm run dist`, install the NSIS output
2. **Create a file, make edits** — verify unsaved-changes prompt works in installed build
3. **Upgrade test** — install over the same path with a newer version number
4. **Uninstall test** — verify uninstall removes the app but NOT `userData` (where recovery drafts + logs live)
5. **File association test** — double-click `.md` in Explorer, verify it opens in the editor

**This is a manual QA pass**, not code changes. Document results in `docs/INSTALLER_QA.md`.

**Files to touch**: Maybe none — document findings. If file associations are broken, fix `package.json` `build.win.fileAssociations`.

---

### 5. Sandbox the Renderer (Hardening)

**Roadmap fit**: "Reliability beats novelty" / Windows desktop quality

**Current state**: `BrowserWindow` has `contextIsolation: true` and `nodeIntegration: false`, but no `sandbox: true`. Electron docs recommend sandbox for new apps.

**What to do**: Enable `sandbox: true` in `webPreferences`. This restricts the renderer further but requires the preload script to be sandbox-compatible — and the preload in this app only uses `contextBridge` + `ipcRenderer`, which **are** sandbox-compatible. So it should be a one-line toggle.

**Implementation sketch**:

```cjs
webPreferences: {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,         // ← add this
}
```

**Test**: Verify the app still launches, menu works, files open/save, About dialog appears.

**Risks**: Low for this app — you're not using Node.js APIs in the preload beyond `contextBridge`/`ipcRenderer`. If something breaks, it's a quick revert.

---

### 6. Public Repo Checklist (Housekeeping)

**Roadmap fit**: Public Repo Checklist

| Item | Status | Action |
|---|---|---|
| README with positioning | ✅ Done | — |
| Screenshot | ❌ Missing | Add a screenshot of the editor with a Markdown file open |
| LICENSE | ❌ Missing | Add a `LICENSE` file (likely MIT) |
| CHANGELOG.md | ❌ Missing | Create one with the v0.1.0 release notes |
| GitHub release | ❌ Not yet | After LICENSE + CHANGELOG + screenshot |
| Git remotes | ❌ Not yet | `git remote add origin` and `git remote add gitea` |

**Quick license suggestion**: MIT is appropriate for a simple desktop utility. Drop a `LICENSE` file in the root.

---

## Architecture Reference (Quick)

```
electron/
  main.cjs         — Window management, IPC handlers, native menu, file ops, logging
  preload.cjs      — contextBridge: exposes window.markdownFiles API + error listeners

src/
  main.tsx          — Entry point, installs browser fallback
  App.tsx           — Top-level state: file path, content, dirty, livePreview, menu listeners
  browserFallback.ts— Stubs window.markdownFiles for browser dev mode
  global.d.ts       — TypeScript declarations for window.markdownFiles
  styles.css        — All styles (OKLCH color palette, CM6 overrides, responsive)

  editor/
    DurableEditor.tsx  — CM6 wrapper: history, search, markdown keybindings, Live Preview toggle
    livePreview.ts     — Hand-rolled CM6 ViewPlugin: hides syntax marks, styles prose
    markdownKeymap.ts  — Ctrl+B/I/1/2/3/>/-/1. keybindings
```

### IPC Channel Map

| Channel | Direction | Purpose |
|---|---|---|
| `file:get-pending-open` | Renderer → Main | Get file path from argv (second-instance or startup) |
| `file:open-dialog` | Renderer → Main | Show native open dialog |
| `file:read` | Renderer → Main | Read file from disk |
| `file:save` | Renderer → Main | Write file (known path) |
| `file:save-as` | Renderer → Main | Show save dialog + write |
| `file:open-request` | Main → Renderer | Second-instance file open |
| `app:set-dirty` | Renderer → Main | Track unsaved changes |
| `app:confirm-unsaved` | Renderer → Main | Show native unsaved-changes dialog |
| `app:close-after-save` | Renderer → Main | Complete close-after-save handshake |
| `app:cancel-close-after-save` | Renderer → Main | Cancel close-after-save handshake |
| `app:save-before-close` | Main → Renderer | Trigger save before window close |
| `menu:new` / `menu:open` / `menu:save` / `menu:save-as` / `menu:find` / `menu:toggle-preview` | Main → Renderer | Menu item clicked |
| `menu:open-recent` | Main → Renderer | Recent file clicked |
| `menu:set-live-preview` | Renderer → Main | Sync checkbox state |
| *(automatic)* `console-message` | Renderer → Main | All console.log/error captured to log file |

---

## Dev Commands

```powershell
npm run dev       # Vite + Electron concurrently (hot reload)
npm run build     # tsc + Vite build
npm run dist      # Full build + electron-builder NSIS installer
npm run start     # Launch existing build
```

Log file location: `%APPDATA%/just-markdown/markdown-editor.log`
