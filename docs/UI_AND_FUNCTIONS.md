# UI And Basic Functions

## UI Principles

- The editor is the product. Chrome should stay quiet.
- The top bar shows document identity, path, dirty state, and file commands.
- The status areas should answer: saved or modified, word count, and current mode.
- Gold Edition belongs in the name, icon, installer, and About dialog. The writing surface stays sincere.
- No decorative panels, startup dashboards, or marketing screens inside the app.

## Current Core Functions

- New document.
- Open local Markdown file.
- Save.
- Save As.
- Live Preview toggle.
- Unsaved-change prompts for New, Open, file association opens, and window close.
- Window title dirty marker.
- Local cursor and scroll position persistence per file.
- Windows installer through `electron-builder`.
- Windows file associations for `.md` and `.markdown`.

## Minimum Daily-Driver Functions

These are the next functions that fit the product boundary:

- Recent files.
- Crash recovery draft for unsaved edits.
- Native application menu.
- About dialog.
- Clear first-run or empty-file state.
- Installer upgrade and uninstall verification.

## Maybe Later

- Auto-update for installed builds. Useful for dogfooding, but not part of the core editor surface.

## 0.4.0 UI Pass

- Use an Impeccable product-register pass to polish the existing shell without expanding scope.
- Keep familiar desktop affordances: native menu, direct toolbar actions, clear status, obvious file identity.
- Add or refine visible states for hover, focus, active, disabled, dirty, saving, error, and recovery.
- Review keyboard-first flows for New, Open, Save, Save As, Find, Live Preview, and close prompts.
- Verify the app on narrow laptop, normal desktop, and ultrawide layouts.
- Do not add dashboards, sidebars, onboarding tours, or decorative UI just because a release needs polish.

## Things To Avoid

- Workspaces.
- Sidebars by default.
- Built-in file trees.
- Markdown flavor configuration sprawl.
- Plugin settings.
- Account/login surfaces.
- Cloud storage integrations.
- Export pipelines unless UAT proves they are needed.

## UAT Questions

- Did opening and saving behave exactly as expected?
- Did any action create fear of data loss?
- Did file association from Explorer feel native?
- Did the toolbar ever get in the way?
- Did Live Preview hide too much or reveal too little?
- Did the app feel fast enough to use as the default `.md` editor?
