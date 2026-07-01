# Just Markdown: Gold Edition

A simple local Markdown editor for Windows. Gold Edition, unfortunately.

The Markdown editor arms race is over. This one opens files.

## What It Is

- A lightweight Windows desktop editor for ordinary `.md` and `.markdown` files.
- A pleasant live-preview writing surface backed by plain Markdown on disk.
- A local app with direct Open, Save, Save As, and file association support.
- A tool that tries hard not to lose your work.

## What It Is Not

- Not a notes system.
- Not a vault.
- Not a PKM graph.
- Not a plugin platform.
- Not a publishing workflow.
- Not a lifestyle choice.

## Current Shape

Markdown stays the on-disk source of truth. Live Preview hides common Markdown marks while rendering prose styling, and raw marks reveal at the cursor so editing remains honest.

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) and [docs/UI_AND_FUNCTIONS.md](docs/UI_AND_FUNCTIONS.md) for the intentionally small scope.

## Development

```powershell
npm install
npm run dev
```

## Package

```powershell
npm run dist
```

Windows file association for `.md` is configured in `package.json` through `electron-builder`.
