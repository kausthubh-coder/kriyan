// Sent to every agent that connects, as the MCP server's instructions.
export const INSTRUCTIONS = `Kriyan is this person's planner: tasks, nested spaces, repeating tasks, reminders, goals and habits.

Read before you plan. Call get_today (for a day), get_week (for seven days) or get_range (up to 62 days, for a month) before suggesting anything about their time, and list_spaces before filing a task into a space. Base every answer on what the tools return.

Find tasks with search_tasks, not by reading whole views: by words, space, planned or due dates, status (open, done, deleted), kind, the agent that added them or externalId. It returns short rows with ids; follow the cursor for more.

Name yourself. Every write takes an agent field: pass your name ("Claude", "Codex"). Kriyan shows the person what each agent changed, with Undo on every change.

Work in batches. To add, change, tick off, delete or restore several tasks, use add_tasks, update_tasks, complete_tasks, delete_tasks or restore_tasks: one call for up to 100, each item answered in place, so one refused item doesn't stop the rest.

Syncing from another system (coursework from Moodle, a calendar, an issue tracker)? Give each task the source's id as externalId and call upsert_tasks every time you sync. A new id adds the task, a known one changes only what differs, and the same input again changes nothing, so a repeated sync never makes duplicates.

Put each fact in its field, never in the title. A due time goes in dueTime next to deadline ("Workshop 8 coding" due 2026-10-30 at 23:55 is deadline "2026-10-30", dueTime 1435), the day it's planned for in date, a class in event: true with its repeat.

Plans go through propose_plan. When you plan time (blocks with a date and a start time), call propose_plan. The blocks appear in the app as proposals the person accepts or discards. Don't create planned blocks with add_task.

Writes other than adding change the plan at once, with no proposal to accept. Check with the person before you change or delete something they planned. If you got something wrong, list_changes shows your recent runs and undo_changes takes back a whole run or chosen changes, the same as Undo in the app.

Routines are one block of small parts done in a row (a morning routine at 07:00: Brush teeth 5, Meditate 10, Gym 45 on Mon/Wed/Fri/Sat, Shower 10). list_routines shows every part with its index; get_today shows the day's routines with only that day's parts, what's ticked and the streak. Build one with add_routine; a part that is a habit takes the habit's id, so tick_routine checks the habit too and it still counts toward its weekly target and its goal. Add the habit first with add_habit.

Goals: a number goal tracks a value (money is a number goal with unit "$"); log where it stands with log_goal, which takes the new total, not a change. A habit feeds a goal through its goalId (add_habit, update_habit), a task through its goalId. A study session that prepares for a test takes the test's id in prepFor, and its view says how many days are left.

get_today lists what's left from earlier days within the person's window (each with ageDays); older leftovers are in get_inbox under older.

Use add_task for things the person asks you to capture. The easiest form is text, written the way they would type it: "essay fri 5pm #school every week remind 1h before", "lab report due thu 23:59".

The person can also type requests in Kriyan's Ask tab. Kriyan has no AI of its own, so get_asks lists the ones waiting for an agent. When you connect, check get_asks; do what each asks with the other tools, then reply with answer_ask in a sentence or two.

Never invent a task's length. Set length only when the person, or the source you sync from, said how long something takes.

Dates are dates in the person's own calendar (2026-10-13); times are minutes after midnight (14:30 is 870). When you talk to the person, write dates like "Tue 13 Oct" and times like "14:30".`;
