# UI And Basic Functions

## UI Principles

- The editor is the product. Chrome should stay quiet.
- The top bar shows document identity, path, dirty state, file commands, common formatting, Find, and Live Preview.
- The status areas should answer: saved or modified, word count, and current mode.
- Formatting controls should be discoverable buttons, while their keyboard shortcuts keep working.
- Gold Edition belongs in the name, icon, installer, and About dialog. The writing surface stays sincere.
- No decorative panels, startup dashboards, or marketing screens inside the app.

## Current Core Functions

- New document.
- Open local Markdown file.
- Save.
- Save As.
- Live Preview toggle.
- Toolbar formatting buttons for bold, italic, headings 1-3, block quote, bullet list, and numbered list.
- Toolbar Find button plus native menu Find.
- Native View menu controls for font size: Smaller, Default, Larger.
- Native View menu controls for reading width: Narrow, Standard, Wide.
- Native View menu theme picker: Gold Standard, Midnight, Evergreen, Paper, and Power User.
- Unsaved-change prompts for New, Open, file association opens, and window close.
- Window title dirty marker.
- Local cursor and scroll position persistence per file.
- Local editor preference persistence for theme, reading font size, and reading width.
- Recent files menu scoped to files opened by this app.
- Recovery draft prompt for unsaved edits from a previous session.
- Windows installer through `electron-builder`.
- Windows file associations for `.md` and `.markdown`.

## Minimum Daily-Driver Functions

These are the next functions that fit the product boundary:

- Verify the new welcome starter document feels calm and does not read like a dashboard.
- Installer upgrade and uninstall verification.
- Refresh the screenshot after the toolbar/theme pass ships.

## Maybe Later

- Auto-update for installed builds. Useful for dogfooding, but not part of the core editor surface.
- Per-file recovery drafts if one global recovery draft ever feels too blunt.
- More Live Preview coverage for Markdown constructs that real documents keep using.

## 0.4.0 UI Pass

- Use an Impeccable product-register pass to polish the existing shell without expanding scope.
- Keep familiar desktop affordances: native menu, direct toolbar actions, clear status, obvious file identity.
- Add or refine visible states for hover, focus, active, disabled, dirty, saving, error, and recovery.
- Review keyboard-first flows for New, Open, Save, Save As, Find, Live Preview, and close prompts.
- Review pointer-first flows for formatting buttons and View-menu reading controls.
- Review all five themes, especially Power User, for readability and clear focus/selection states.
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
- Did toolbar formatting preserve the current selection and produce plain Markdown?
- Did the View menu theme, font-size, and reading-width choices persist after restart?
- Did Live Preview hide too much or reveal too little?
- Did the app feel fast enough to use as the default `.md` editor?
