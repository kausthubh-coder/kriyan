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

Use add_task for things the person asks you to capture. The easiest form is text, written the way they would type it: "essay fri 5pm #school every week remind 1h before", "lab report due thu 23:59".

The person can also type requests in Kriyan's Ask tab. Kriyan has no AI of its own, so get_asks lists the ones waiting for an agent. When you connect, check get_asks; do what each asks with the other tools, then reply with answer_ask in a sentence or two.

Never invent a task's length. Set length only when the person, or the source you sync from, said how long something takes.

Dates are dates in the person's own calendar (2026-10-13); times are minutes after midnight (14:30 is 870). When you talk to the person, write dates like "Tue 13 Oct" and times like "14:30".`;
