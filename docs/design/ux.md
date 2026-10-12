# Kriyan UX foundation

What the app is for, what people need to see, what they need to do, and how every screen is grouped and behaves. The brand kit says how it looks; this file says how it works. Read it before designing or building any screen.

## 1. The point

Kriyan turns everything you have to do into a plan for your time, and helps you follow it.

Everything else serves three questions, in this order:

1. **What am I doing now, and what's next?** (seconds, many times a day, mostly on the phone)
2. **Does today fit?** (a few minutes, morning or the night before)
3. **Is everything captured, and am I on track?** (seconds to capture; fifteen minutes a week to review)

If a screen does not help answer one of these, it does not belong in the main navigation.

## 2. Who and how often

- One person planning their own life across school, work and everything else. They are not a team and not a project manager.
- Desktop: kept open all day next to their work. Phone: glanced at between things, and where reminders land.
- State of mind: busy and slightly behind. The app should lower that, never add to it. No streaks that reset, no red walls of overdue work, no guilt copy.
- Their AI agents (Claude, ChatGPT, Cursor, scripts) are also users. They read and write the same plan through MCP and the CLI.

**Feel: calm, exact, fast.** Compact and instant on desktop with a mouse, comfortable on touch, quiet everywhere. Colour belongs to the person's spaces; the interface itself is neutral.

## 3. The daily loop

| Moment | When | Time it should take | Where |
|---|---|---|---|
| Capture | Any time an idea arrives | Under 3 seconds | `N` or `+` anywhere, phone share sheet, AI |
| Plan the day | Morning or night before | Under 5 minutes | Today |
| Do | All day | Glances | Today's Now card, reminders |
| Fix the day | When something slips | One action | "Move to tomorrow", drag, "Reschedule late" |
| Plan the week | Once a week | About 15 minutes | Upcoming |
| Review progress | Weekly | A few minutes | Progress |

Capture never asks a question. Anything without a space or date goes to the Inbox, and the Inbox is emptied while planning, not while capturing.

Planning is optional. Today works without it. "Plan today" is a 60-second sheet (carry over leftovers, pull from the Inbox, check the time fits) and "Close the day" is one tap that moves what is left. Neither ever blocks the app: planners that make the ritual a gate are the ones people abandon.

## 4. Information architecture

Three groups, always in this order:

| Group | Destinations | Question it answers |
|---|---|---|
| Time | Inbox, Today, Upcoming | What and when |
| Spaces | The person's own tree of spaces, nested as deep as they like | Where things belong |
| Progress | Goals, Habits, Activity | Am I on track |

Search and every command live in one command menu (`Ctrl K`). Settings sits at the bottom of the sidebar and is never a tab.

**Desktop sidebar:** Inbox (count), Today (count), Upcoming, then Spaces (the tree), then Progress. One click to anything.

**Phone tab bar (thumb reach):** Today, Upcoming, Add (centre), Inbox, Browse. Browse holds Spaces, Progress, search and Settings. Habits check-in also appears on Today, because it is daily.

### Data, in plain terms

- **Task**: a title, optionally a space, a date, a time, a length, a deadline, repeats, reminders, a goal, and a note. Only the title is required. Never invent a length.
- **Event**: a task with a fixed time that you attend rather than complete (a class, a meeting). Same editor, one switch.
- **Space**: a named, coloured container. Spaces nest (Work, then Kriyan, then Launch). A child takes its parent's colour unless the person picks one. A space has its own page with tasks, child spaces, goals and a note.
- **Goal**: a target with a date (a number, a count of tasks, or milestones). Tasks and time can count towards it.
- **Habit**: something repeated with a weekly target ("4 times a week"). Missing a day does not reset anything.
- **Note**: Markdown blocks attached to a task or a space. Agents read and write it as plain Markdown.

## 5. Screens

### Today (the home screen)

Shows only today:

- The date and **free time left** ("3 h 20 min free"). This is the capacity check, not a score.
- **Now and next:** the current block with its end time, and the next block with when it starts.
- **Timeline:** today's fixed events and time-boxed tasks, from now onwards first. Earlier hours are collapsed above.
- **To do today:** tasks dated today without a time. Drag one onto the timeline to box it.
- **From earlier:** unfinished tasks from earlier days, collapsed to one row with "Move to today" and "Pick a day". Never a red list, never the word "overdue" in the interface.
- **Habits:** today's check-ins as a row of toggles.

Desktop puts the list and the timeline side by side, and opens a selected task in a side panel that replaces the right column. Nothing on Today opens a modal.

### Upcoming (plan the week)

- Desktop: seven day columns with an all-day row (deadlines, birthdays), a time grid, and a **load bar** per day (planned hours against free hours). The Inbox and undated tasks sit in a left tray to drag in.
- Phone: an agenda grouped by day, each day with its load bar. Tap a day to plan it like Today. On the phone's Today, a long press lifts a task from the list onto the timeline, and an edge tray holds unscheduled tasks; the "Schedule" field is the visible twin.

### Inbox

Everything captured without a home. Each row offers "Today", "Pick a date" and "Move to space" without opening the task. Empty Inbox is the one place the app celebrates.

### Space page

Breadcrumb (Work / Kriyan / Launch), then: next tasks, later tasks, child spaces, goals in this space, and the space's note. Child spaces appear as rows, not cards.

### Task detail

One editor for every kind of task. Order: title, space, when (date, time, optional length), repeat, reminders, deadline, goal, note. Fields that are empty show as quiet "Add" rows, so the editor is short for simple tasks and complete for complex ones.

- Desktop: side panel. Phone: bottom sheet with a medium and a full height.
- Notes on Android: a toolbar above the keyboard (add block, turn into, checklist, link) so "/" is not the only way in. Keep typing latency under one frame; notes load when the task opens, never in the list.

### Repeat editor (one interface for every rule)

1. A text field first: "every tue and thu 9am for 1h30", "last friday of every month", "every year". It parses as you type and shows the result in words.
2. Presets for the common ones: Every day, Weekdays, Every week on {today}, Every month on the {13th}, Every year on {13 Oct}.
3. Custom: every N days, weeks, months or years. Weeks pick days. Months pick "on day 13", "on the second Tuesday", or "on the last day". Years pick the date.
4. Ends: never, on a date, or after N times.
5. Repeat from: the schedule, or from when I finish it (for "every 2 days after I run").
6. **Always show the next five dates.** That list is how people trust a rule.
7. Editing one occurrence asks "Only this one" or "This and later". Store exceptions on the series; never split it into a second series.
8. Say what happens on short months: "on the 31st" falls on the last day of shorter months, and the editor says so.

The typed grammar is the same in quick add, the CLI and MCP, and lives once in `packages/core`: `every tue and thu 9am for 1h30`, `every 2 days`, `every 15th`, `every last fri`, `every last day`, `every year`, `until dec 11`, `for 10 times`, and `every!` (or "after done") to repeat from completion.

### Reminders

A task can have any number. Timed tasks get the person's default reminder (10 minutes before unless they change it); untimed tasks get a separate default (09:00 on the day). Each reminder is either relative ("10 min before", "1 day before at 20:00") or absolute ("Fri 16 Oct at 09:00"). Relative reminders follow the task when it moves. One tap adds the common ones; custom is a second step. The task row shows a bell with the count.

### Progress

- **Goals:** each with its target, where you are, and whether you are on pace ("4 km behind pace"). Linked tasks below.
- **Habits:** each with this week's progress against its target, "weeks on target" instead of a streak, and a 26-week heatmap. Tap a cell to fix a day. Missing a day never resets anything.
- **Activity:** a heatmap of completed time per day across the year, filterable by space. "Where did my time go" in one picture.

## 6. How things react

| Action | What happens | Why |
|---|---|---|
| Tick a task | The circle fills at once, the title dims, the row stays in place for a moment, then moves to Done. Undo in a toast. | Instant feedback, and the list does not jump under the pointer. |
| Delete | Happens at once, Undo for 5 seconds, Trash for 30 days. No "Are you sure?". | Undo instead of asking. |
| Drag a task onto the timeline | The task lifts with a shadow, snaps to 15 minutes, and shows its start and end while moving. Escape cancels. | Precision without fiddling. |
| Drop or reschedule on the phone | A light haptic on drop. | Feel the moment the eye confirms. |
| Resize a block | The end time follows the pointer in 15-minute steps. | Length is optional, so resizing adds one. |
| Open the command menu | Opens with no animation, cursor in the field. | Used dozens of times a day. |
| Open a task | Side panel slides in over 200 ms with ease-out. Keyboard opens it without animation. | Occasional and spatial. |
| An AI changes the plan | Its changes show as proposed blocks with "Accept" and "Undo", and a log line names the agent. | People stay in charge of their own time. |
| Reduced motion | Slides become fades. | Less movement, not no feedback. |

Every gesture has a visible twin: swipe right to complete has a checkbox, swipe left to reschedule has a "Move" button, long-press to drag has a "Schedule" field.

## 7. States every screen has

- **Loading:** a skeleton in the same layout, so nothing jumps.
- **First use:** says what goes here and offers one action ("Add your first task").
- **No results:** echoes the query and offers to clear the filter.
- **Cleared:** "Nothing left today." with a check, and no button.
- **Offline:** a quiet banner; edits queue and sync.
- **Error:** says what happened and what to do.

## 8. Keyboard

`N` new task, `Ctrl K` command menu, `T` Today, `U` Upcoming, `I` Inbox, `J` and `K` move, `Enter` open, `X` complete, `D` date, `R` repeat, `M` move to space, `Delete` delete with undo, `Escape` close. Every command shows its shortcut in the command menu.

## 9. Agents

- MCP and the CLI use the same operations as the app. Anything a person can do, an agent can do, and the reverse.
- Agent changes are tagged with the agent's name and can be undone as one group.
- `apply_plan` from an agent arrives as a proposal on Upcoming and Today until the person accepts it, unless they have turned on "Let agents edit directly".

## 10. Research behind these choices

From a review of Sunsama, Akiflow, Structured, Things, TickTick, Todoist, Motion, Reclaim, Tiimo, Fantastical and Notion Calendar (October 2026). People quit planners because of ritual fatigue, plans that reshuffle themselves, guilt from growing overdue lists, planning taking longer than doing, weak phone apps, sync lag, and streaks that reset. Kriyan's answers: optional planning, agents propose and people accept, one quiet "From earlier" row, a 3-second capture, the same features on the phone, optimistic local-first writes, and weekly habit targets.
