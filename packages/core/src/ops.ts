// Every operation an agent can run, defined once. The HTTP API (POST /api/v1/<name>),
// the MCP server (one tool per operation) and the CLI read this list.

type Schema = Record<string, unknown>;

const date = { type: "string", description: "A date like 2026-10-13, in the person's own calendar." };
const minutes = (what: string) => ({
  type: "integer",
  minimum: 0,
  maximum: 1439,
  description: `${what}, in minutes after midnight (14:30 is 870).`,
});
const id = (what: string) => ({ type: "string", description: `The ${what}'s id.` });

export const repeatSchema: Schema = {
  type: "object",
  description:
    "How the task repeats. Examples: every Tue and Thu {freq:'week',interval:1,weekdays:[1,3]}; last day of each month {freq:'month',interval:1,monthly:{kind:'last'}}; second Tuesday {freq:'month',interval:1,monthly:{kind:'nth',n:2,weekday:1}}; yearly {freq:'year',interval:1}; every 2 days after done {freq:'day',interval:2,fromCompletion:true}. Weekdays: 0 Monday to 6 Sunday.",
  properties: {
    freq: { enum: ["day", "week", "month", "year"] },
    interval: { type: "integer", minimum: 1, maximum: 999 },
    weekdays: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
    monthly: {
      oneOf: [
        {
          type: "object",
          properties: { kind: { const: "day" }, day: { type: "integer", minimum: 1, maximum: 31 } },
          required: ["kind", "day"],
        },
        { type: "object", properties: { kind: { const: "last" } }, required: ["kind"] },
        {
          type: "object",
          properties: {
            kind: { const: "nth" },
            n: { enum: [1, 2, 3, 4, -1] },
            weekday: { type: "integer", minimum: 0, maximum: 6 },
          },
          required: ["kind", "n", "weekday"],
        },
      ],
    },
    end: {
      oneOf: [
        { type: "object", properties: { kind: { const: "on" }, date }, required: ["kind", "date"] },
        {
          type: "object",
          properties: { kind: { const: "count" }, count: { type: "integer", minimum: 1 } },
          required: ["kind", "count"],
        },
      ],
    },
    fromCompletion: { type: "boolean" },
  },
  required: ["freq", "interval"],
};

export const remindersSchema: Schema = {
  type: "array",
  description:
    "Reminders. {kind:'before',minutes:10} fires 10 minutes before the start (or before 09:00 for a task with no time); {kind:'day',offset:-1,time:1200} fires the day before at 20:00.",
  items: {
    oneOf: [
      {
        type: "object",
        properties: { kind: { const: "before" }, minutes: { type: "integer", minimum: 0 } },
        required: ["kind", "minutes"],
      },
      {
        type: "object",
        properties: {
          kind: { const: "day" },
          offset: { type: "integer", maximum: 0 },
          time: { type: "integer", minimum: 0, maximum: 1439 },
        },
        required: ["kind", "offset", "time"],
      },
    ],
  },
};

const taskFields: Record<string, Schema> = {
  title: { type: "string" },
  spaceId: id("space"),
  date,
  time: minutes("Start time"),
  length: {
    type: "integer",
    minimum: 1,
    maximum: 1440,
    description: "Length in minutes. Leave it out unless the person said how long; never guess.",
  },
  deadline: { ...date, description: "When it's due, if different from the day it's planned for." },
  repeat: repeatSchema,
  reminders: remindersSchema,
  note: { type: "string", description: "Markdown." },
  steps: {
    type: "array",
    maxItems: 50,
    description:
      "A short checklist inside the task, in order, like [{title:'Outline',done:true},{title:'Draft',done:false}]. Send the whole list; it replaces the old one.",
    items: {
      type: "object",
      properties: { title: { type: "string", maxLength: 200 }, done: { type: "boolean" } },
      required: ["title", "done"],
      additionalProperties: false,
    },
  },
  event: {
    type: "boolean",
    description: "True for something attended (a class, a meeting) rather than ticked off.",
  },
  goalId: id("goal"),
};

/** Fields that may be cleared with null in update_task. */
const nullable = (s: Schema) => ({ oneOf: [s, { type: "null" }] });

export interface OpSpec {
  name: string;
  title: string;
  description: string;
  /** Reads never change anything. */
  kind: "read" | "write";
  /**
   * A write that edits, moves or removes what's already there, rather than only adding. MCP
   * clients read it (destructiveHint) to decide when to ask the person first.
   */
  destructive?: true;
  /** Calling it again with the same input changes nothing more (MCP's idempotentHint). */
  idempotent?: true;
  input: Schema;
}

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const agentField: Schema = {
  type: "string",
  maxLength: 40,
  description:
    "Your name as the person should see it, like 'Claude' or 'Codex'. Kriyan lists what each agent changed, with Undo. Defaults to the access token's name.",
};

/** Every write takes the caller's name, so the person can see who changed what. */
const named = (op: OpSpec): OpSpec =>
  op.kind === "write"
    ? {
        ...op,
        input: {
          ...op.input,
          properties: { ...(op.input.properties as Record<string, Schema>), agent: agentField },
        },
      }
    : op;

const BASE_OPS: OpSpec[] = [
  {
    name: "get_today",
    title: "Get today",
    kind: "read",
    description:
      "Read the person's plan for a day (today by default): scheduled blocks, anytime tasks, tasks due that day with no day of their own, done tasks, tasks left from earlier days, and habits. Read this before planning.",
    input: obj({ date }),
  },
  {
    name: "get_week",
    title: "Get a week",
    kind: "read",
    description:
      "Read seven days starting on a date (Monday of this week by default): each day's blocks, deadlines and planned hours against capacity, plus the inbox and unscheduled tasks.",
    input: obj({ start: date }),
  },
  {
    name: "get_inbox",
    title: "Get the inbox",
    kind: "read",
    description: "Read tasks captured without a date or a space.",
    input: obj({}),
  },
  {
    name: "get_space",
    title: "Get a space",
    kind: "read",
    description: "Read one space: its next and later tasks, child spaces, goals, note and stats.",
    input: obj({ spaceId: id("space") }, ["spaceId"]),
  },
  {
    name: "get_task",
    title: "Get a task",
    kind: "read",
    description: "Read one task by id, with its note, repeat and reminders.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "list_spaces",
    title: "List spaces",
    kind: "read",
    description: "List every space as a tree, with ids, colours and paths like 'Work / Kriyan'.",
    input: obj({}),
  },
  {
    name: "get_progress",
    title: "Get progress",
    kind: "read",
    description: "Read time done this week and this year, time by space, goals against pace and habits.",
    input: obj({}),
  },
  {
    name: "add_task",
    title: "Add a task",
    kind: "write",
    description:
      "Add a task. Either pass `text` as one sentence the way a person types it ('essay fri 5pm #school every week remind 1h before') or pass the fields. Only the title is required. Never invent a length. Returns the task as saved, so check what was understood.",
    input: obj({
      text: { type: "string", description: "One sentence, parsed like the app's quick add." },
      ...taskFields,
    }),
  },
  {
    name: "update_task",
    title: "Change a task",
    kind: "write",
    destructive: true,
    idempotent: true,
    description:
      "Change fields of a task. Pass null to clear a field. Changing the date of a repeating task moves only that occurrence; later ones keep their usual days. To change the days, change `repeat`.",
    input: obj(
      {
        taskId: id("task"),
        ...Object.fromEntries(
          Object.entries(taskFields).map(([k, s]) => [k, k === "title" ? s : nullable(s)]),
        ),
      },
      ["taskId"],
    ),
  },
  {
    name: "complete_task",
    title: "Complete a task",
    kind: "write",
    destructive: true,
    description:
      "Tick a task off. A repeating task moves to its next date. Send the date you read it on (null for a task with no date): if it has moved since, as after a retried call, the tick is refused instead of ticking the next occurrence too. The reply's completionId and date undo it with undo_complete.",
    input: obj({ taskId: id("task"), date: nullable(date) }, ["taskId"]),
  },
  {
    name: "undo_complete",
    title: "Undo a tick",
    kind: "write",
    destructive: true,
    idempotent: true,
    description:
      "Take back a tick from complete_task: the task returns to the date it was on and the tick stops counting. Send the completionId and date from complete_task's reply.",
    input: obj({ taskId: id("task"), completionId: id("completion"), date: nullable(date) }, [
      "taskId",
      "completionId",
      "date",
    ]),
  },
  {
    name: "reopen_task",
    title: "Reopen a task",
    kind: "write",
    destructive: true,
    idempotent: true,
    description:
      "Mark a finished task as not done. A repeating task isn't finished by a tick (it moves to its next date); use undo_complete for that.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "delete_task",
    title: "Delete a task",
    kind: "write",
    destructive: true,
    idempotent: true,
    description:
      "Delete a task, with all its repeats. restore_task brings it back within 30 days. Check with the person first.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "restore_task",
    title: "Restore a deleted task",
    kind: "write",
    idempotent: true,
    description: "Bring back a task deleted in the last 30 days, as it was.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "move_tasks",
    title: "Move tasks",
    kind: "write",
    destructive: true,
    idempotent: true,
    description: "Move tasks to a date, optionally at a time. Pass date null to unschedule.",
    input: obj(
      {
        taskIds: { type: "array", items: id("task") },
        date: nullable(date),
        time: nullable(minutes("Start time")),
      },
      ["taskIds", "date"],
    ),
  },
  {
    name: "close_day",
    title: "Close the day",
    kind: "write",
    destructive: true,
    idempotent: true,
    description:
      "Move everything still open today to tomorrow, keeping times. Events, done tasks and proposals stay.",
    input: obj({}),
  },
  {
    name: "add_space",
    title: "Add a space",
    kind: "write",
    description: "Add a space, optionally inside another one. Colour defaults to the parent's.",
    input: obj(
      {
        name: { type: "string" },
        color: { enum: ["blue", "green", "orange", "purple", "red", "yellow", "teal", "pink"] },
        parentId: id("parent space"),
      },
      ["name"],
    ),
  },
  {
    name: "update_space",
    title: "Change a space",
    kind: "write",
    destructive: true,
    idempotent: true,
    description: "Rename a space, change its colour or parent, or replace its Markdown note.",
    input: obj(
      {
        spaceId: id("space"),
        name: { type: "string" },
        color: { enum: ["blue", "green", "orange", "purple", "red", "yellow", "teal", "pink"] },
        parentId: nullable(id("parent space")),
        note: { type: "string" },
      },
      ["spaceId"],
    ),
  },
  {
    name: "add_habit",
    title: "Add a habit",
    kind: "write",
    description: "Add a habit with a weekly target (1 to 7 times a week).",
    input: obj(
      {
        title: { type: "string" },
        target: { type: "integer", minimum: 1, maximum: 7 },
        spaceId: id("space"),
      },
      ["title", "target"],
    ),
  },
  {
    name: "check_habit",
    title: "Check a habit",
    kind: "write",
    destructive: true,
    idempotent: true,
    description: "Mark a habit done or not done on a day (today by default).",
    input: obj({ habitId: id("habit"), done: { type: "boolean" }, date }, ["habitId", "done"]),
  },
  {
    name: "add_goal",
    title: "Add a goal",
    kind: "write",
    description:
      "Add a goal: a number to reach (kind 'number', e.g. 100 km) or a count of linked tasks to finish (kind 'tasks').",
    input: obj(
      {
        title: { type: "string" },
        kind: { enum: ["number", "tasks"] },
        target: { type: "number" },
        unit: { type: "string" },
        dueDate: date,
        spaceId: id("space"),
      },
      ["title", "kind", "target"],
    ),
  },
  {
    name: "update_goal",
    title: "Change a goal",
    kind: "write",
    destructive: true,
    idempotent: true,
    description: "Update a goal's progress (`current`), target, unit or due date.",
    input: obj(
      {
        goalId: id("goal"),
        title: { type: "string" },
        target: { type: "number" },
        current: { type: "number" },
        unit: nullable({ type: "string" }),
        dueDate: nullable(date),
      },
      ["goalId"],
    ),
  },
  {
    name: "propose_plan",
    title: "Propose a plan",
    kind: "write",
    description:
      "Propose new time blocks. They appear in the app as proposals the person accepts or discards, so use this for plans rather than add_task. Each block is a new task with a date, a time and a length.",
    input: obj(
      {
        blocks: {
          type: "array",
          items: obj(
            {
              title: { type: "string" },
              date,
              time: minutes("Start time"),
              length: taskFields.length!,
              spaceId: id("space"),
              note: { type: "string" },
            },
            ["title", "date", "time"],
          ),
        },
      },
      ["blocks"],
    ),
  },
  {
    name: "get_asks",
    title: "Get waiting requests",
    kind: "read",
    description:
      "Read what the person typed in Kriyan's Ask tab that Kriyan couldn't do on its own and is waiting for an agent, oldest first. Kriyan has no AI of its own: you are the one who answers. Do what each asks with the other tools, then call answer_ask.",
    input: obj({}),
  },
  {
    name: "answer_ask",
    title: "Answer a request",
    kind: "write",
    idempotent: true,
    description:
      "Reply to one request from get_asks. The reply shows in the Ask tab under the request, with Undo on every change you made since it was asked, so say briefly what you did ('Moved the lab report to 14:00 and added 2 reading blocks') or answer the question. Plain sentences, no Markdown headings.",
    input: obj(
      {
        askId: id("request"),
        reply: { type: "string", maxLength: 2000 },
      },
      ["askId", "reply"],
    ),
  },
];

export const OPS: OpSpec[] = BASE_OPS.map(named);

export function findOp(name: string): OpSpec | undefined {
  return OPS.find((op) => op.name === name);
}
