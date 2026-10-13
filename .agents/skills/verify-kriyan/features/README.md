# Kriyan verification map

One file per user-facing feature. Each lists every entry point a person uses, how to drive it, and the state that proves it. Proving a feature means covering the entry points its file lists, or reporting the ones you skipped.

## Baseline

- `bun run dev` is up and `node .agents/skills/verify-kriyan/doctor.mjs` prints `Ready.`
- `node apps/app/e2e/seed.mjs` has run this session. It leaves, dated from today in the machine's time zone:
  - spaces Work (Kriyan, Clients), School (Calculus, Physics), Life, all blue;
  - Today: "Write MCP tools" 10:00 for 1h30, "Read chapter 7.4" at 22:00, anytime "Book the dentist" and "Run" (every 2 days after done);
  - "Calculus II lecture" every Tue and Thu 9:00 for 1h30, "Mum's birthday" yearly on 16 Oct with a reminder the day before at 20:00, "Send the invoice" tomorrow, "Problem set 4" on Friday, "Look into standing desks" in the Inbox.
- Web widths: 1440x900 for desktop, 390x844 for phone. Below 760px the app uses the phone layout.

## Conventions

- Handles are ARIA roles and accessible names. Rows are `button "Open <title>"` (plus `, <time range>` when scheduled); checkboxes are `Complete: <title>` and `Mark not done: <title>`; toasts are `role="status"`.
- Assert what a person sees after a reload or on a second surface, not only the toast.
- Dates read like `Thu 15 Oct`, `Today`, `Tomorrow`. Compute expected dates with `@kriyan/core/dates` and `@kriyan/core/format` (Node imports them directly) rather than hard-coding them.

## Features

- [Capture](./capture.md): one sentence becomes a task, from Today's field, quick add, the command menu, the API and the CLI.
- [Today and the timeline](./today.md): what's next, anytime tasks, the schedule, drag, resize, the "Earlier today" fold.
- [Complete and repeat](./complete-repeat.md): tick off, undo, a repeating task moving to its next date.
- [Reminders](./reminders.md): a reminder ringing on Android, including for tasks added elsewhere.
- [Agents](./agents.md): personal access tokens, the API, the CLI, the MCP server, proposals reviewed on Upcoming.
- [Spaces and notes](./spaces-notes.md): nested spaces, colours, Markdown notes with the slash menu.
- [Android](./android.md): opening the dev build and driving it with adb.
