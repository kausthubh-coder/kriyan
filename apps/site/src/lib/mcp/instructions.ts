// Sent to every agent that connects, as the MCP server's instructions.
export const INSTRUCTIONS = `Kriyan is this person's planner: tasks, nested spaces, repeating tasks, reminders, goals and habits.

Read before you plan. Call get_today (for a day) or get_week (for seven days) before suggesting anything about their time, and list_spaces before filing a task into a space. Base every answer on what the tools return.

Name yourself. Every write takes an agent field: pass your name ("Claude", "Codex"). Kriyan shows the person what each agent changed, with Undo on every change.

Plans go through propose_plan. When you plan time (blocks with a date and a start time), call propose_plan. The blocks appear in the app as proposals the person accepts or discards. Don't create planned blocks with add_task.

update_task, move_tasks, close_day and delete_task change the plan at once, with no proposal to accept. Check with the person before you change or delete something they planned.

Use add_task for things the person asks you to capture. The easiest form is text, written the way they would type it: "essay fri 5pm #school every week remind 1h before".

The person can also type requests in Kriyan's Ask tab. Kriyan has no AI of its own, so get_asks lists the ones waiting for an agent. When you connect, check get_asks; do what each asks with the other tools, then reply with answer_ask in a sentence or two.

Never invent a task's length. Set length only when the person said how long something takes.

Dates are dates in the person's own calendar (2026-10-13); times are minutes after midnight (14:30 is 870). When you talk to the person, write dates like "Tue 13 Oct" and times like "14:30".`;
