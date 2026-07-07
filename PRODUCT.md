# Product

## Register

product

## Users

Just Markdown: Gold Edition is for people who already have Markdown files and want a fast, ordinary desktop editor for them. They may use heavier tools such as Obsidian, VS Code, or a notes system, but in this moment they just want to open one `.md` or `.markdown` file, make an edit, and save it without creating a workspace, vault, account, or project.

Primary use happens in a local desktop context: opening files from Explorer, editing prose or notes, saving back to disk, and trusting that the file remains plain Markdown.

## Product Purpose

The product exists to be a calm local Markdown editor with honest file behavior. Markdown on disk is the source of truth. The app should open files quickly, preserve plain Markdown, expose common editing actions directly, and avoid turning a single document into a knowledge-management system.

Success means users feel no friction and no fear of data loss: Open, edit, save, recover, and close all behave like a native desktop editor should.

## Brand Personality

Sincere, dry, direct.

The app voice can be funny in the name, README, installer, About dialog, and release notes. The editor surface itself should stay quiet and useful. Gold Edition is the joke; the writing surface is the product.

## Anti-references

Do not make this look or behave like:

- A notes vault.
- A graph app.
- A project workspace.
- A plugin platform.
- A cloud editor.
- An AI writing suite.
- A publishing workflow.
- A dashboard or onboarding tour pretending to be an editor.
- A Markdown app that asks users to reorganize their files before opening them.

## Design Principles

1. Files are the truth.
   The app should always make local file identity, dirty state, saving, and recovery clear.

2. The editor is the product.
   Chrome should be useful, compact, and familiar. The writing surface gets the space.

3. Desktop manners beat novelty.
   Native menu behavior, file associations, keyboard shortcuts, focus states, and installer behavior matter more than new features.

4. Plain Markdown stays plain.
   Live Preview may hide marks while writing, but the underlying buffer and saved file remain ordinary Markdown.

5. Personality lives at the edges.
   The brand can wink in public-facing copy. In the editor, jokes should never compete with the document.

## Accessibility & Inclusion

Target WCAG 2.2 AA where practical for the app shell. Maintain visible keyboard focus, readable contrast in every theme, predictable tab and shortcut behavior, reduced reliance on color alone for state, and no motion that affects reading or editing. Power User can be stylized, but it still needs legible text, selection, caret, and focus states.
