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
  input: Schema;
}

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const OPS: OpSpec[] = [
  {
    name: "get_today",
    title: "Get today",
    kind: "read",
    description:
      "Read the person's plan for a day (today by default): scheduled blocks, anytime tasks, done tasks, tasks left from earlier days, and habits. Read this before planning.",
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
      "Add a task. Either pass `text` as one sentence the way a person types it ('essay fri 5pm #school every week remind 1h before') or pass the fields. Only the title is required. Never invent a length.",
    input: obj({
      text: { type: "string", description: "One sentence, parsed like the app's quick add." },
      ...taskFields,
    }),
  },
  {
    name: "update_task",
    title: "Change a task",
    kind: "write",
    description:
      "Change fields of a task. Pass null to clear a field. Changing the date of a repeating task moves the whole series.",
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
    description: "Tick a task off. A repeating task moves to its next date.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "reopen_task",
    title: "Reopen a task",
    kind: "write",
    description: "Mark a finished task as not done.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "delete_task",
    title: "Delete a task",
    kind: "write",
    description: "Delete a task. The person can restore it from the app.",
    input: obj({ taskId: id("task") }, ["taskId"]),
  },
  {
    name: "move_tasks",
    title: "Move tasks",
    kind: "write",
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
        agent: { type: "string", description: "Your name, shown to the person, like 'Claude'." },
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
      ["agent", "blocks"],
    ),
  },
];

export function findOp(name: string): OpSpec | undefined {
  return OPS.find((op) => op.name === name);
}
