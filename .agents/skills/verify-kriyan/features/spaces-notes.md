# Spaces and notes

Spaces are a person's own groups, nested to any depth, each with one of eight colours shown as a dot. Spaces and tasks carry Markdown notes edited block by block, with a `/` menu for headings, lists and checklists.

## Sub-features

- `spaces-tree` the sidebar (desktop) and the Spaces section on Ask (phone) show spaces nested under their parents.
- `spaces-add` `Add space` (phone, on Ask) or `Add a space` (desktop sidebar), optionally inside another; a child takes its parent's colour.
- `spaces-colour` `Space options`, `Change colour`, a colour radio.
- `spaces-view` a space shows its tasks and its note.
- `notes-edit` `Add a note`, type, `/` opens the block menu, `[ ] ` makes a checklist item.

## How to get to it (user POV)

- Desktop: the space names in the sidebar. Phone: the Ask tab's Spaces section.
- A space's `Space options` menu.
- A task's panel: the note under its fields.

## Driving it with Playwright

Preconditions: baseline seed.

- **Open a space.** `page.goto(BASE + "/ask")` (`/browse` redirects there), click `link "Kriyan"` (`exact: true`, `.last()`), wait for `/space/`. "Write MCP tools" is listed.
- **Colour.** `button "Space options"`, `menuitem "Change colour"`, `radio "Purple"`. The sidebar dot for Kriyan turns purple; reload and it stays.
- **Note.** `button "Add a note"`, fill `textbox /^Note/` with `/`, `option /Heading/` appears; Enter, type `Launch plan`, Enter, type `[ ] Demo video`, click outside. After a reload `Launch plan` shows as a heading and `checkbox /Demo video/` exists.
- **Proof.** Screenshots before and after, and `node apps/app/e2e/api.mjs get_space '{"spaceId":"<id>"}'` showing the note's Markdown.

## Gotchas

- Space names repeat across levels (two "Calculus" under different parents are fine); use `.last()` or scope to a parent.
- Notes save on blur; click outside before reloading.
