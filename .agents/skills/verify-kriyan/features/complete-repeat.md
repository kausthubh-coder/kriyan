# Complete and repeat

Ticking a task off shows it done at once with a toast and Undo. A repeating task moves to its next occurrence and the toast names the date; one with an end finishes on its last occurrence.

## Sub-features

- `complete-tick` the checkbox, the toast `Done: <title>` and `Undo`.
- `complete-next` a repeating task's toast says `Next: <day>` and the task reappears on that day.
- `complete-undo` Undo puts the task and its date back, including during the moment the row stays.
- `complete-keyboard` J and K select, X completes, on desktop.
- `complete-api` `complete_task` returns `next`; the CLI prints `Done "<title>". Next: <day>.`

## How to get to it (user POV)

- The checkbox on any row; X on a selected row; `kriyan done <title>`; an agent calling `complete_task`.

## Driving it with Playwright

Preconditions: baseline seed ("Run" repeats every 2 days after done and sits on today).

- **Tick a repeat.** `page.getByRole("checkbox", { name: "Complete: Run" }).click()`. Within a second `checkbox "Mark not done: Run"` shows, then statuses `Done: Run` and `Next: <formatDay(addDays(today, 2), today)>`.
- **Undo.** `page.getByRole("button", { name: "Undo" }).click()`; `checkbox "Complete: Run"` is back on Today.
- **Next date lands.** Tick again without undo and open Upcoming: `Run` sits two days ahead.
- **Proof.** The toast screenshot, Upcoming after a reload, and `node apps/app/e2e/api.mjs get_week` showing Run's `date`.

## Gotchas

- "Every N days after done" counts from the day it was done; a fixed repeat (every Tue and Thu) counts from the rule.
- Moving a repeating task moves only that occurrence; the next one keeps its usual day.
- The done row stays a moment before it moves. Assert after it settles, or assert the undo inside that moment on purpose.
