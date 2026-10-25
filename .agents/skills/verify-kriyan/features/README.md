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
- [Today and the timeline](./today.md): what's next, anytime tasks, the schedule, drag, resize, the "Earlier today" fold, moving a row (hover or swipe), Close the day, Plan today, row selection.
- Planning the week: the Week's "Not scheduled yet" tray (Inbox and undated tasks; the toolbar's "To plan" button shows or hides it) drags onto a day's header (that day, no time) or into the grid (at a time). `node apps/app/e2e/plan-week.mjs` after `seed.mjs`.
- [Complete and repeat](./complete-repeat.md): tick off, undo, a repeating task moving to its next date.
- Undo and Recently deleted: a toast's 5 seconds stop while the pointer or focus is on it; Ctrl+Z (outside text fields) runs the newest toast's Undo; Recently deleted (`/trash`, from Settings' "Open recently deleted" or the command menu) lists deleted tasks by the day they were deleted, each with `button "Restore <title>"`, for 30 days. `node apps/app/e2e/undo-and-trash.mjs` after `seed.mjs` (both widths).
- Navigation (design v5): no tab bar. Phone: `/menu` (Today's left floating button) lists `link "Inbox, N"`, the spaces grouped under their top-level parent (`link "Calculus, 3"`; a group's name links to the parent), `link "Goals and habits"`, `link "Agents"`, `link "Settings"`; pages have `button "Back"`, lists a floating `button "Add"`. Desktop: `navigation "Main"`, the rail with the same links plus Today, and the keys. `node apps/app/e2e/shell-screens.mjs` screenshots Menu, Inbox, a space, Goals, Agents and Settings at 390 and 1440 in both schemes to `.artifacts/app/joi-shell/`.
- Goals and habits (`/goals`; `/progress` redirects): goal cards with `button "Log +$20 on Save $2,000"` (calls `goals.log`), the title opens the editor; habits as rows whose name opens "Edit habit" with "Fix a day" (`button /^Read 20 min, .*Edit or fix a day/`). `node apps/app/e2e/habit-edit.mjs` adds a habit through the API and drives the editor.
- Agents (`/agents`): each run's lines with `button "Undo: Added …"`, the MCP address with `button "Copy the MCP address"`, `switch "Let agents edit directly"`.
- [Reminders](./reminders.md): a reminder ringing on Android, including for tasks added elsewhere.
- Ask (`/ask`, out of the navigation in v5; the command menu and `A` reach it): `textbox "Ask Kriyan"` and the suggestion chips; Kriyan answers fixed requests itself with Undo, anything else shows "Waiting for a connected agent to answer" until an agent calls `answer_ask`; an agent's reply lists its changes with Undo and Edit; Automations lists this week's agent runs. With no token and no agent activity it says "Kriyan has no AI of its own". `node apps/app/e2e/ask.mjs` after `seed.mjs` (`W=390` for the phone).
- [Agents](./agents.md): personal access tokens, the API, the CLI, the MCP server, proposals reviewed on Upcoming.
- [Spaces and notes](./spaces-notes.md): nested spaces, colours, Markdown notes with the slash menu.
- [Android](./android.md): opening the dev build and driving it with adb.
- First run and sign-in: signed out, a browser that has never had anyone signed in opens `/onboarding` (steps 1 to 9; the step lives in `localStorage["kriyan.onboarding"]`), one that has opens `/sign-in`, which leads with Google and `button "Email me a code"`, with the password form behind `button "Use a password instead"`. Drive onboarding as the test account: "I already have an account" or step 6's `textbox "Email"`, `button "Send code"`, then `textbox "6-digit code"` filled with `424242`; the draft (hours, first task) saves to the account once, and a second run adds nothing when `onboardedAt` is set. A brand-new address hits Clerk's captcha headless, so sign-up can't be automated.
- Feel and settings: Settings has Sounds (off by default; on the web each sound is a WebAudio oscillator or noise buffer, so spy on `AudioContext.prototype.createOscillator`), Haptics (Android only, kept on the device), the Evening review chips (`radio "Review at 21:00"`) and the Semester days (`button "First day: ..."` opens the day picker). Goals reads the semester for its weeks-left card.
