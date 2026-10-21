# Today and the timeline

Today shows what's next and when, today's habits, anytime tasks, and a schedule of timed blocks with a line at now. Blocks move and resize in 15-minute steps; anytime tasks drag onto the schedule.

## Sub-features

- `today-next` the "Next, at HH:MM" block with the time until it.
- `today-anytime` today's tasks without a time, with "N left".
- `today-schedule` blocks from day start to day end. Blocks starting within 30 minutes of each other sit side by side; a later one sits on top, indented, so the one below keeps its title (`layoutDay` in `packages/core/src/layout.ts`).
- `today-fold` hours before now fold behind `Earlier today`; a block that started above the fold starts at its edge.
- `today-drag` drag an anytime row onto the schedule to give it a time.
- `today-resize` drag a block's bottom edge to set its length.
- `today-free` "N h N min free" at the top.
- `today-move` hover a row (desktop) for "Tomorrow" (or "Today" on a row from an earlier day) and "Pick a day"; on phones, swipe left for the same two, a long swipe left moves it, a long swipe right ticks it off. Every move toasts "Moved to <day>: <title>" with Undo.
- `today-close` in the last four hours of the day, "N still open today" with "Move to tomorrow" (also "Close the day" in the command menu and the `close_day` agent op). Events, done tasks and proposals stay.
- `today-plan` "Plan today" (phones: "Plan") when anything is left from earlier days or in the Inbox: earlier tasks are picked, Inbox ones are a choice, the sheet says how the picks fit the free time, "Add N to today" moves them with Undo.
- `today-select` clicking a row selects it and it stays selected after its panel closes, so `X`, `D`, `R`, `M` and `Delete` act on it; the command menu lists them under "Selected task".

## How to get to it (user POV)

- `/today`, the first screen after sign-in; `T` from anywhere on desktop; the Today tab on phone.

## Driving it with Playwright

Preconditions: baseline seed. After 11:30 local time, "Write MCP tools" crosses the fold.

- **Read the day.** `page.goto(BASE + "/today")`, `settle(page)`. `page.getByLabel("Schedule")` holds `button "Open Write MCP tools, 10:00–11:30"`; anytime rows include `Open Book the dentist` and `Open Run`.
- **Fold.** The first block's top is below the `Schedule` heading's bottom. `button "Earlier today"` toggles to `Hide earlier hours` and shows the hours from day start.
- **Drag.** Hover the row, `mouse.down()`, move a few pixels, move onto the hour label `getByLabel("Schedule").getByText("18:00", { exact: true })`, `mouse.up()`. The row becomes `button "Open <title>, 18:00"`. `apps/app/e2e/walkthrough.mjs` has the exact moves.
- **Resize.** Drag the block's bottom edge down 30px at desktop width (56px an hour): the label becomes `18:00–18:30`.
- **Proof.** A screenshot before and after each move, then `node apps/app/e2e/api.mjs get_today` shows the new `time` and `length`.
- **Fix the day, plan it, select rows.** After a fresh `seed.mjs` each: `node apps/app/e2e/fix-the-day.mjs` (hover Move, Pick a day, Close the day and Undo, phone swipes; Close the day needs the evening, the last four hours before day end), `node apps/app/e2e/plan-today.mjs` (both widths), `node apps/app/e2e/select-row.mjs`. Each prints `ok` or `FAIL` per step and saves screenshots.

## Gotchas

- Hour labels within 20 minutes of now are hidden so they don't collide with the now time; find hours by the labels that remain.
- Phone width uses 96px an hour so a 30-minute block is a 44px target; pixel steps differ by width.
- `signedInContext` sets `reducedMotion: "reduce"`; a context without it screenshots blocks mid-animation.
- Swipes on the web need a mouse drag with several moves (`fix-the-day.mjs` has a `swipe` helper); one jump doesn't activate the gesture. The phone layout turns off mouse drag-to-schedule so it doesn't fight the swipe.
- A row's own hover comes from pointer enter/leave, not `Press`: RN-web ends a Pressable's hover over any control inside it.
- Git Bash rewrites `/today`-style arguments into Windows paths; run the e2e scripts with `MSYS_NO_PATHCONV=1`.
