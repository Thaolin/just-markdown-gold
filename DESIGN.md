# Design

## Overview

Just Markdown: Gold Edition is a restrained product UI for a local Markdown editor. The interface should feel like a dependable desktop tool: compact, direct, readable, and a little opinionated only where it helps the product identity.

The current app shell has four main regions:

- Top bar: document identity, file actions, formatting actions, Find, and Live Preview.
- Subbar: saved/modified/loading/error state and word count.
- Editor: CodeMirror writing surface with Live Preview styling.
- Status bar: unsaved/saved state and current preview mode.

## Color

Use OKLCH tokens already defined in `src/styles.css`. Keep the product-register default restrained: tinted neutrals, one clear accent, and state colors for warning/error.

Core semantic tokens:

- `--bg`: app and editor background.
- `--panel`: top/status surfaces.
- `--panel-2`: default button surface.
- `--panel-3`: hover/raised surface.
- `--border`: separators and grouped controls.
- `--fg`: primary text.
- `--muted`: paths, secondary text, Markdown marks.
- `--accent`: focus, active affordances, primary state.
- `--accent-weak`: primary-button fill support.
- `--warn`: dirty/recovery state.
- `--bad`: error state.

Theme roles:

- Gold Standard: default dark restrained shell with a teal accent.
- Midnight: deeper blue reading environment.
- Evergreen: green-tinted quiet mode.
- Paper: light reading mode.
- Power User: high-energy monospace terminal mode.

Do not collapse the themes into one palette. Each theme should keep its personality while preserving the same component vocabulary.

## Typography

UI text uses the system UI stack:

`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Reading text uses a serif stack by default:

`Cambria, "Iowan Old Style", "Palatino Linotype", Georgia, serif`

Monospace text uses:

`"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace`

Type scale:

- Small UI and metadata: 12px.
- Main UI controls: 13px to 14px.
- Document title: 15px.
- Reading text: 16px, 18px, or 20px through View menu preference.

Line length options:

- Narrow: 58ch.
- Standard: 68ch.
- Wide: 82ch.

## Layout

Use a full-height app shell with fixed top/status regions and one flexible editor region. Avoid cards and page-section composition. This is not a website surface.

Top bar rules:

- Keep file identity left and controls right on wider windows.
- Wrap into a vertical layout below 760px.
- Preserve toolbar grouping so file actions, save actions, formatting, and preview state remain scannable.

Editor rules:

- Center readable content with measure-based horizontal padding.
- Keep generous vertical padding inside the document surface.
- On narrow windows, reduce editor padding to keep text usable.

## Components

### Buttons

Buttons are compact desktop controls with a 6px radius, 1px border, and clear hover/focus/disabled states. Primary buttons are for Save and recovery Restore only. Formatting buttons are fixed-size icon buttons.

Expected states:

- Default.
- Hover.
- Focus visible.
- Disabled.
- Primary.
- Loading blocked where relevant.

### Toolbar Groups

Toolbar groups use a subtle border and slightly mixed panel background. They should read as control clusters, not cards.

Groups:

- New/Open.
- Save/Save As.
- Formatting and Find.
- Live Preview toggle.

### Document Identity

The title row contains dirty dot plus file name. The path line uses muted monospace text and must truncate gracefully.

Dirty state appears in at least three ways:

- Dirty dot changes to warning color.
- Title marker uses `*`.
- Status text says `modified`.

### Strips

Error and recovery strips are inline status surfaces, not modals.

- Error uses `--bad`.
- Recovery uses `--warn`.
- Both should remain readable in all themes.
- Recovery actions should stay attached to the strip.

### Editor Surface

The editor should feel sincere and document-first. Markdown marks can be muted when visible. Styled headings, bold, italic, horizontal rules, bullets, quotes, selections, search matches, and CodeMirror search panel all inherit theme tokens.

## Interaction

Keyboard-first flows must remain reliable:

- New.
- Open.
- Save.
- Save As.
- Find.
- Undo/Redo.
- Cut/Copy/Paste.
- Live Preview.
- Close with unsaved changes.

Pointer-first flows must preserve editor selection when toolbar formatting runs.

Focus must be visible on buttons, toggle inputs, CodeMirror search fields, and any future controls.

## Motion

Keep motion minimal. Current button transitions for background, border, and color are enough. Do not animate layout, editor text, or reading position.

## Accessibility

Check each theme for:

- Text contrast.
- Focus visibility.
- Disabled readability.
- Selection visibility.
- Search match visibility.
- Dirty/error/recovery state clarity without relying on color alone.

Avoid tiny hit targets. Formatting icon buttons should keep stable 32px sizing.

## UI Pass Scope

For the 0.4.0 UI pass, refine the existing app shell rather than redesigning it.

Audit and improve:

- Top bar hierarchy.
- Toolbar button vocabulary.
- Hover, active, focus, disabled, loading, dirty, error, and recovery states.
- Status/substatus bars.
- Empty/new document state.
- Recent files and native menu copy.
- Narrow, normal, and ultrawide layout behavior.
- All five themes.

Do not add dashboards, sidebars, onboarding tours, account surfaces, file trees, settings screens, or decorative panels.
