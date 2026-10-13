// Help text for `kriyan --help` and `kriyan <command> --help`.

export const MAIN_HELP = `kriyan: plan your days with Kriyan from a terminal.

Usage
  kriyan <command> [arguments] [options]

See your plan
  today [date]             Now and next, the schedule, anytime tasks, habits and free time
  week [start]             Seven days from Monday, or from the date you give
  inbox                    Tasks without a date or a space
  spaces                   Your spaces as a tree
  progress                 Time done, goals and habits

Change it
  add <sentence>           Add a task the way you'd say it
  done <task>              Tick a task off
  move <task...> <when>    Move tasks to another day or time
  rm <task>                Delete a task; restore it from the app
  habit <name>             Check a habit for today, or uncheck it with --undo
  propose                  Propose time blocks from a file for you to accept in the app

Account
  login                    Save a personal access token from Settings
  logout                   Remove the saved token

For agents
  call <op> [json]         Run any operation of the agent API
  ops                      List the operations

Options
  --json                   Print the result as JSON, for agents and scripts
  -h, --help               Show help for a command
  -v, --version            Show the version

A task is the number shown next to it in your last listing, part of its title, or its id.

Examples
  kriyan today
  kriyan add "essay fri 5pm #school every week remind 1h before"
  kriyan done 2
  kriyan move 3 5 tomorrow 9am
  kriyan today --json

Environment
  KRIYAN_TOKEN             Use this token instead of the saved one
  KRIYAN_API_URL           Talk to another Kriyan server (default https://kriyan.app)
  NO_COLOR                 Leave out the coloured space dots

Exit codes: 0 done, 1 Kriyan said no, 2 a usage or network problem.`;

export const COMMAND_HELP: Record<string, string> = {
  today: `Usage: kriyan today [date] [--json]

Shows a day: what's on now and next, the schedule, anytime tasks, tasks from earlier days,
habits, and how much free time is left before your day ends.

Examples
  kriyan today
  kriyan today tomorrow
  kriyan today fri
  kriyan today --json`,
  week: `Usage: kriyan week [start] [--json]

Shows seven days, Monday first unless you give a start date, with planned time against
your daily capacity, deadlines, the inbox and tasks with no date yet.

Examples
  kriyan week
  kriyan week mon
  kriyan week 19 oct`,
  inbox: `Usage: kriyan inbox [--json]

Shows tasks captured without a date or a space.`,
  spaces: `Usage: kriyan spaces [--json]

Shows your spaces as a tree. --json includes their ids, for kriyan call.`,
  progress: `Usage: kriyan progress [--json]

Shows time done this week and over the last 12 months, time by space, goals against
their pace, and habits.`,
  add: `Usage: kriyan add <sentence> [--json]

Adds a task from one sentence, read the same way as quick add in the app, and shows what
was understood. Quotes are optional. A task with no date or space goes to the inbox.

Examples
  kriyan add "essay fri 5pm #school every week remind 1h before"
  kriyan add "calculus lecture every tue and thu 10:00-11:30 #school"
  kriyan add "mum's birthday 16 oct every year remind day before at 20:00"
  kriyan add "run every 2 days after done"
  kriyan add buy stamps`,
  done: `Usage: kriyan done <task>

Ticks a task off. A repeating task moves to its next date.

Examples
  kriyan done 2
  kriyan done essay`,
  move: `Usage: kriyan move <task...> <when>

Moves one or more tasks to a date, and to a time if you give one. A time on its own means today.

Examples
  kriyan move 3 tomorrow
  kriyan move 1 4 fri 9am
  kriyan move essay 13 oct at 14:30`,
  rm: `Usage: kriyan rm <task>

Deletes a task. You can restore it from the app.

Examples
  kriyan rm 4
  kriyan rm "old reading list"`,
  habit: `Usage: kriyan habit <name> [--undo]

Checks a habit for today, or unchecks it with --undo. The name can be part of the habit's name.

Examples
  kriyan habit read
  kriyan habit stretch --undo`,
  propose: `Usage: kriyan propose --agent <name> --file <plan.json>

Proposes time blocks. They show in the app until you accept or discard them, unless you let
agents edit directly in Settings. The file holds a list of blocks, or an object with
"blocks" (and optionally "agent"). Use --file - to read from standard input.

A block: { "title": "Essay draft", "date": "2026-10-13", "time": 870, "length": 90 }
Time is minutes after midnight (14:30 is 870). Leave out the length unless you know it.

Example
  kriyan propose --agent Claude --file plan.json`,
  login: `Usage: kriyan login [--token <token>]

Saves a personal access token. Create one in Kriyan under Settings, then paste it when asked,
pass it with --token, or pipe it in. The token is checked before it's saved.

Examples
  kriyan login
  kriyan login --token kriyan_...`,
  logout: `Usage: kriyan logout

Removes the saved token from this computer. Revoke it in Settings to stop it working everywhere.`,
  call: `Usage: kriyan call <op> [json]

Runs any operation of the agent API with a JSON object as its input, and prints the result
as JSON. kriyan ops lists the operations; kriyan ops --json includes their input schemas.

Examples
  kriyan call list_spaces
  kriyan call add_space '{"name":"Reading","color":"teal"}'
  kriyan call update_task '{"taskId":"...","note":"Bring the lab book"}'`,
  ops: `Usage: kriyan ops [--json]

Lists the operations kriyan call can run. --json includes each one's input schema.`,
};
