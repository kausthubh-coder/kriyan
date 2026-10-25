# Kriyan design v5 (Joi)

`prototype.html` is the spec: open it in a browser, switch Phone / Desktop web at the top, and use "Jump to a screen". Where the app and the prototype disagree on how something looks or behaves, the prototype wins. Values still come from `packages/core/src/tokens.ts` (add a token there and run `bun run tokens` if one is missing) and `.critly/policy.json` (never edit it). v4 (B2) is the previous look.

## What changed from v4

- **One screen.** No tab bar. Today is the app. On phones, three floating round buttons sit at the bottom: Menu (left), Add (centre), Month (right; on another day it becomes "back to today"). On desktop, a quiet left rail replaces the tabs.
- **Joi's Today.** White page, the big day name with the red dot, the date on the right, the week strip. The black summary sentence is a pull-down (tap the day name).
- **Time blocks.** Today shows the day as blocks from Wake up (`dayStart`) to Wind down (`dayEnd`): each block is tinted in its space's colour and as tall as it is long (min 58 px, about 1.05 px a minute), free stretches are dashed gaps ("1 h 45 free", the current one in red: "Now, 2 h 50 free until 13:30"), past gaps hide, the block you're in carries a red now line. Items without a length are thin rows. Settings can switch Today to a one-line-per-item list.
- **To fit in.** One horizontally scrolling row of chips above the day: things due today that have no time yet and aren't due during a class, what's left from this week, and tasks planned today without a time. Tapping one (or a gap) opens Fill: pick a task, pick a length (never guessed), and it becomes a block.
- **Routines.** A routine is one block made of parts (Brush teeth 5 min, Meditate 10 min, Gym 45 min on Mon/Wed/Fri/Sat, Shower 10 min). A part can be a habit; ticking it also checks the habit, so it still counts toward the habit's weekly target and its goal. Morning routines sit right after Wake up, night routines right before Wind down.
- **Rows say one thing on the right**: `13:30–14:45`, `● Now`, `Due 23:59`, `Due Fri 6 Nov`, `3 days ago`, `1 of 3`; repeats and reminders are small glyphs before it; the space is a coloured checkbox (or icon) plus its name in grey after the title, hidden when the title already says it or inside that space.
- **Sheets** are Joi's floating card with big tiles: Complete, Tomorrow, Edit, Remove (events: Edit, Skip once, Remove; suggestions: Accept, Not now; routines: tick each part, All done).
- **Goals** show progress, a small trend line, quick log buttons (+$20, −0.5 kg) and what feeds them ("Fed by Gym").
- **Ask chat is gone from navigation.** Agents (in the menu) lists each agent's runs with Undo and how to connect over MCP.

## Build contract

Three slices are built in parallel. Each owns its files; meet at these shapes.

### A. Data and MCP (`packages/convex`, `packages/core`, ops)

- `routines` table: `ownerId, title, spaceId?, time (minutes), parts: [{ title, length?, habitId?, weekdays? (0 Mon..6 Sun) }], order, archivedAt?`. Ticks per date and part index in their own table, indexed by owner and date.
- `todayView.routines`: `{ _id, title, color, spaceId, time, length (today's parts summed), parts: [{ index, title, length, habitId, done }], streak, done }`, only the parts that run on that weekday.
- Mutations: `routines.add`, `routines.update`, `routines.remove` (archive), `routines.tickPart({ routineId, index, date, done })` (also checks or unchecks the linked habit), `routines.tickAll({ routineId, date, done })`.
- Habits gain `goalId?`. `HabitView` adds `goalId` and `routineId` (set when a routine part links it). Habits inside a routine don't show on their own on Today.
- Goals: money is a `number` goal with unit `$`. New `goalEntries` table `{ goalId, date, value }`; `goals.log({ goalId, value })` sets `current` and appends an entry. `GoalView` adds `entries` (last 12) and `feeds: { habits: string[], tasks: number }`; a `tasks` goal counts tasks whose `goalId` is the goal.
- Tasks gain `prepFor?: Id<"tasks">` (a study session prepares for a test). `TaskView.prepFor: { title, date, daysLeft } | null`.
- Profile: `dayStart` is Wake up and `dayEnd` is Wind down. New: `todayLayout: "blocks" | "list"` (default blocks), `earlierWindow: "none" | "week" | "month" | "all"` (default week), `showSpace` (default true), `hideDone` (default false). `todayView.profile` returns them; the profile update mutation accepts them.
- `todayView.earlier` honours `earlierWindow` and gives each item `ageDays`. Older ones stay reachable in the Inbox (`inboxView.older`).
- Agent ops for all of it (add/update/delete routine, tick a part, log a goal, link a habit or task to a goal, set `prepFor`), documented in `instructions.ts` and the MCP docs page.

### B. Shell and secondary screens (`apps/app/src/app/(app)/_layout*`, `features/shell`, `settings`, `progress`, `space`, `inbox`, new `menu` and `agents`)

- Remove the tab bar and the Week/Goals/Ask tabs. Routes: `/menu` (phone), `/goals`, `/agents`, `/settings`, `/inbox`, `/space/[id]`.
- Menu: Inbox, spaces grouped under their top-level parent (School, Projects, Life), Goals and habits, Agents, Settings.
- Desktop: the left rail (Today and Inbox with counts, grouped spaces, Goals and habits, Agents, Settings, the key hints) and the page area beside it.
- Goals and habits, Settings (Today shows, earlier window, show space, hide finished, now badge, wake / review / wind-down times), space page, Inbox, Agents, all in v5's row style.

### C. Today and tasks (`features/today`, `features/tasks`, the `/`, `/task/[id]` and `/add` routes)

- Today: header, week strip, pull-down summary, time blocks and gaps, To fit in, Fill, routine and class blocks, the list layout, the three floating buttons (Menu links to `/menu`), the month sheet.
- Sheets for task, event, suggestion, routine, habit, block (lists the space's next tasks) and study session ("CSC 316 exam 2 in 7 days").
- Add (Habit / Task / Event, quick add with the parsed words in blue and chips), Edit as rows that open pickers (day, time and length, due day and time, repeat, reminders, space, steps).
- Desktop Today: the centre column with quick add and the right panel (summary, month, due in the next 7 days, or the selected item with its tiles), and the keys N, T, arrows, J/K, X, E, Escape.
