# Today (design v5)

Today is the app's one screen: the big day with the red dot, the week strip, "To fit in", and the day as time blocks from Wake up (`dayStart`) to Wind down (`dayEnd`), or one line per item when Settings' "Today shows" is a list. The rules (blocks, gaps, To fit in, each row's fact, the summary sentence) are in `packages/core/src/today.ts`; the screen is `apps/app/src/features/today`.

## Sub-features

- `today-blocks` a block per thing with a length, tinted in its space's colour, as tall as it is long (58px at least, about 1.05px a minute); things with a time and no length are thin rows; Wake up, Review today (at `reviewTime`) and Wind down are thin rows too.
- `today-gaps` dashed free stretches between them (`button "1 h 45 free. Fill 11:30–13:15"`); the one you're in is red and starts now (`"Now, 2 h 50 free until 13:30. Fill …"`); today's stretches already over are gone.
- `today-now` the block you're in says `Now` and carries a red line at now.
- `today-routines` a routine is one block with its parts as round chips (`switch "Done: Gym"`, `"Not done yet: Brush teeth"`); morning routines sit right after Wake up, night ones right before Wind down. Ticking a part also checks its habit (`routines.tickPart`).
- `today-classes` an event shows the tasks due during it as chips (`checkbox "Complete: Quiz"`, "due in class"); an event titled "Work on <space>" is that space's time block and names the space's next task.
- `today-fit-in` one sideways row of chips: due that day with no time (and not during a class), left from earlier (today only, within Settings' window), planned that day with no time. `button "Fit in Exercise 16, due 23:59"`; a long press opens the task.
- `today-fill` a chip or a gap opens `dialog "Fill free time"`: candidates as radios, `radio "30 min"`…, `button "Put it at 10:45–11:15"` (disabled as "Pick how long" until a length is picked; never a guess). The toast `"<title>, 10:45–11:15"` has Undo.
- `today-list` the list layout (`profile.todayLayout: "list"`, `aria-label "Today's list"`): one line per item, the fact on the right (`13:30–14:45`, `Now`, `Due 23:59`, `Due Fri`, `3 days ago`, `1 of 3`), repeat and reminder glyphs, the space's name in grey when it fits. Phones swipe right to finish, left for Tomorrow (a short swipe shows Tomorrow and Pick a day).
- `today-sheets` phones open Joi's floating card: a task (`/task/<id>`: Complete, Tomorrow, Edit, Remove), an event (countdown, Edit, Skip once, Remove), a suggestion (Accept, Not now), a routine (its parts, All done), a habit (Done today, stats, the month's dots), a time block (the space's next tasks), a study session ("Calculus exam 2 in 7 days", session N of M). Desktop shows the same in the right panel.
- `today-edit` `/task/<id>?edit=1` (the card's Edit, or `E` on desktop): title and note, then rows that open pickers: Day, Time and length, Due, Repeat, Reminders, Space, Steps, Goal. `?edit=when|repeat|space` opens that picker (D, R, M keys).
- `today-add` the round Add opens `dialog "Add"` with tabs Habit / Task / Event, the sentence with the understood words in blue, chips, `button "Add"`. It adds to the day on screen; a task with only a due date keeps no day (it shows in To fit in on its due day). `/add?spaceId=` adds to that space.
- `today-month` phones: the round Month button opens the month with dots on days with something due and "N with no day yet" (to the Inbox); on another day the button is `"Back to today"`. Desktop: the month is in the right panel.
- `today-summary` `button "Show the summary"` (the day name; pull down on Android) opens the black sentence: "Good morning. You have 2 classes, 3 things due … You're free until 13:30."
- `today-desktop` the centre column with `textbox "Add a task"` (N focuses it) and the right panel (summary, month, "Due in the next 7 days", or the selected item). Keys: N, T, ← and → (days), J and K (select), X (finish the selected task, habit or routine), E (edit), Escape.

## How to get to it (user POV)

- `/today` (`/` sends there), the first screen after sign-in; `T` anywhere on desktop; "Today" in the desktop rail.
- Another day: the week strip, the month (phone), ← and → (desktop), `/today?day=2026-10-28`.

## Driving it with Playwright

Preconditions: baseline seed (it adds a Morning routine at 07:00, a Night routine at 22:00, habits, goals and a study session that prepares for an exam a week out). Fake the time with `page.clock.setFixedTime(new Date("<today>T10:40:00"))` before `goto`.

- **Read the day.** `page.goto(BASE + "/today")`, `settle(page)`. `page.getByLabel("Schedule")` holds `button "Open Write MCP tools, 10:00–11:30"`, `button "Open Morning routine, 07:00–…"` and the gaps.
- **Open something.** Phone: clicking a block goes to `/task/<id>`, a `dialog` with the tiles. Desktop: it selects the block and `complementary "Details"` shows the tiles; `button "Close details"` clears it.
- **Fill.** Click a chip or a gap, then `radio "30 min"`, then `button /^Put it at /`; the block appears as `Open <title>, <range>`. `apps/app/e2e/plan-today.mjs` has the moves.
- **Switch layouts.** `node apps/app/e2e/api.mjs update_settings '{"todayLayout":"list"}'` (and back to `"blocks"`).
- **Proof.** A screenshot before and after, then `node apps/app/e2e/api.mjs get_today` shows the new `time` and `length`.
- **Scripts**, each after a fresh `seed.mjs`, printing `ok` or `FAIL` per step: `walkthrough.mjs` (habit, goal via Edit, ticks and Undo, Fill, a block's length, Remove and Undo, keys), `fix-the-day.mjs` (panel Tomorrow, Edit's Day picker, Close the day, phone swipes in the list layout), `plan-today.mjs` (To fit in and Fill at both widths), `select-row.mjs`, `today-clock.mjs` (the now line, the red gap, past gaps hidden, a due day), `proposals.mjs` (Accept and Not now on a suggestion), `check-add-sheet.mjs`, `undo-and-trash.mjs`.

## Gotchas

- Untimed tasks aren't blocks: in the blocks layout they're To fit in chips (a tap opens Fill, a long press the task). Tick them from the list layout or their sheet.
- The suggestion, routine and habit sheets are in-screen overlays, not routes; only tasks open `/task/<id>`.
- `signedInContext` sets `reducedMotion: "reduce"`; a context without it screenshots sheets mid-animation.
- Swipes on the web need a mouse drag with several moves (`fix-the-day.mjs` has a `swipe` helper); one jump doesn't activate the gesture.
- The day you looked at is kept while you open a task and come back; `T` or "Back to today" returns.
- Git Bash rewrites `/today`-style arguments into Windows paths; run the e2e scripts with `MSYS_NO_PATHCONV=1`.
