# Capture

A person types one sentence and gets a task with its date, time, length, space, repeat and reminders filled in. A `#space` or `#parent/child` that doesn't exist yet is created.

## Sub-features

- `capture-today` adds from Today's field; no date typed means today.
- `capture-quick` adds from the quick add sheet (N on desktop, the + button on phone).
- `capture-command` adds from the command menu (Ctrl+K) when the text isn't a search hit.
- `capture-parse` reads dates, times, lengths, repeats, "until" and "N times", reminders and `#space`.
- `capture-api` adds through `add_task` with `text`, the way agents and the CLI do.

## How to get to it (user POV)

- Today: the `Add a task` field at the top.
- Press `N` on desktop, or tap the floating `Add` button (Today's centre button, or the one on the Inbox and a space).
- Press `Ctrl+K`, type into `Search or type a task`, press Enter.
- `kriyan add "<sentence>"` in a terminal, or an agent calling `add_task`.

## Driving it with Playwright

Preconditions: baseline seed.

- **Today field.** `page.getByRole("textbox", { name: "Add a task" }).fill("Stretch 15:30 for 20m #life")`, press Enter. `button "Open Stretch, 15:30–15:50"` appears in the Schedule.
- **Command menu.** `page.keyboard.press("Control+k")`, fill `Search or type a task` with `call mum fri 6pm #life every week`, press Enter. A status `Added: call mum` shows; on Upcoming the task sits on Friday at 18:00 with `Every week`.
- **Parse check.** `node apps/app/e2e/api.mjs add_task '{"text":"Essay last fri of month 17:00 remind 1h before #school"}'`, then open it in the app: the task panel shows the repeat as the last Friday of the month and a reminder 1 hour before.
- **Proof.** Reload, screenshot the list or day the task landed on, and open its panel to show the parsed fields.

## Gotchas

- Lowercase `#school` creates `School`; an existing space matches case-insensitively.
- The parser lives in `packages/core/src/parse.ts` with unit tests. Prove parsing rules there; prove the UI path here.
- The phone sheet's field wraps and grows to three lines; Enter adds (Shift+Enter is a new line on the web). `node apps/app/e2e/check-add-sheet.mjs` types a long sentence at 390, prints the field's height, presses Enter and finds the task in the week.
