# Spaces and notes

Spaces are a person's own groups, nested to any depth, each with one of eight colours shown as a dot. Spaces and tasks carry Markdown notes edited block by block, with a `/` menu for headings, lists and checklists.

## Sub-features

- `spaces-tree` the rail (desktop) and the menu (phone, `/menu`) group spaces under their top-level parent; top-level spaces with nothing inside gather under "Spaces".
- `spaces-add` `Add a space` (menu or rail), or "Add a space inside …" on a space's page; a child takes its parent's colour.
- `spaces-colour` `Space options`, `Change colour`, a colour radio.
- `spaces-view` a space shows its tasks and its note.
- `notes-edit` `Add a note`, type, `/` opens the block menu, `[ ] ` makes a checklist item.

## How to get to it (user POV)

- Desktop: the space names in the rail. Phone: the menu.
- A space's `Space options` menu.
- A task's panel: the note under its fields.

## Driving it with Playwright

Preconditions: baseline seed.

- **Open a space.** `page.goto(BASE + "/menu")` (`/browse` redirects there), click `link /^Kriyan(, \d+)?$/` (`.last()`), wait for `/space/`. "Write MCP tools" is listed.
- **Colour.** `button "Space options"`, `menuitem "Change colour"`, `radio "Purple"`. The rail's dot for Kriyan turns purple; reload and it stays.
- **Note.** `button "Add a note"`, fill `textbox /^Note/` with `/`, `option /Heading/` appears; Enter, type `Launch plan`, Enter, type `[ ] Demo video`, click outside. After a reload `Launch plan` shows as a heading and `checkbox /Demo video/` exists.
- **Proof.** Screenshots before and after, and `node apps/app/e2e/api.mjs get_space '{"spaceId":"<id>"}'` showing the note's Markdown.

## Gotchas

- Space names repeat across levels (two "Calculus" under different parents are fine); use `.last()` or scope to a parent.
- Notes save on blur; click outside before reloading.
