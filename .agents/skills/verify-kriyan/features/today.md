# Today and the timeline

Today shows what's next and when, today's habits, anytime tasks, and a schedule of timed blocks with a line at now. Blocks move and resize in 15-minute steps; anytime tasks drag onto the schedule.

## Sub-features

- `today-next` the "Next, at HH:MM" block with the time until it.
- `today-anytime` today's tasks without a time, with "N left".
- `today-schedule` blocks from day start to day end, side by side when they overlap.
- `today-fold` hours before now fold behind `Earlier today`; a block that started above the fold starts at its edge.
- `today-drag` drag an anytime row onto the schedule to give it a time.
- `today-resize` drag a block's bottom edge to set its length.
- `today-free` "N h N min free" at the top.

## How to get to it (user POV)

- `/today`, the first screen after sign-in; `T` from anywhere on desktop; the Today tab on phone.

## Driving it with Playwright

Preconditions: baseline seed. After 11:30 local time, "Write MCP tools" crosses the fold.

- **Read the day.** `page.goto(BASE + "/today")`, `settle(page)`. `page.getByLabel("Schedule")` holds `button "Open Write MCP tools, 10:00–11:30"`; anytime rows include `Open Book the dentist` and `Open Run`.
- **Fold.** The first block's top is below the `Schedule` heading's bottom. `button "Earlier today"` toggles to `Hide earlier hours` and shows the hours from day start.
- **Drag.** Hover the row, `mouse.down()`, move a few pixels, move onto the hour label `getByLabel("Schedule").getByText("18:00", { exact: true })`, `mouse.up()`. The row becomes `button "Open <title>, 18:00"`. `apps/app/e2e/walkthrough.mjs` has the exact moves.
- **Resize.** Drag the block's bottom edge down 30px at desktop width (56px an hour): the label becomes `18:00–18:30`.
- **Proof.** A screenshot before and after each move, then `node apps/app/e2e/api.mjs get_today` shows the new `time` and `length`.

## Gotchas

- Hour labels within 20 minutes of now are hidden so they don't collide with the now time; find hours by the labels that remain.
- Phone width uses 96px an hour so a 30-minute block is a 44px target; pixel steps differ by width.
- `signedInContext` sets `reducedMotion: "reduce"`; a context without it screenshots blocks mid-animation.
