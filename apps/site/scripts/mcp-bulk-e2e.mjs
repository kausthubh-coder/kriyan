// End-to-end check of the bulk tools through the hosted MCP server, the way a coursework sync
// agent uses them: upsert a Moodle sync twice (the second changes nothing), add a batch with one
// bad item, search, read a month, list the agent's changes and undo a run.
//   KRIYAN_TOKEN=kriyan_... node apps/site/scripts/mcp-bulk-e2e.mjs http://localhost:3000/mcp
// It adds tasks with externalIds starting "e2e:"; rerunning it finds them and reports them unchanged.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.argv[2] ?? "http://localhost:3000/mcp");
const token = process.env.KRIYAN_TOKEN;
if (!token) throw new Error("Set KRIYAN_TOKEN to a personal access token (kriyan_...).");

const client = new Client({ name: "kriyan-bulk-e2e", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
);
const { tools } = await client.listTools();
console.log(`connected, ${tools.length} tools`);

let failures = 0;
const check = (what, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  console.log(`\n> ${name} ${JSON.stringify(args)}`);
  if (result.isError) {
    console.log(`< error: ${text}`);
    return { error: text };
  }
  console.log(`< ${text.length > 1500 ? `${text.slice(0, 1500)}... (${text.length} chars)` : text}`);
  return JSON.parse(text);
}

const agent = "Chitti school";
const sync = [
  {
    externalId: "e2e:moodle:assign:812",
    title: "Workshop 8 coding",
    deadline: "2026-10-30",
    dueTime: 1435,
  },
  {
    externalId: "e2e:moodle:assign:913",
    title: "Workshop 9 coding",
    deadline: "2026-11-06",
    dueTime: 1435,
    note: "Recursion and trees",
  },
  {
    externalId: "e2e:moodle:class:cs101",
    title: "CS101 lecture",
    date: "2026-10-27",
    time: 600,
    length: 90,
    event: true,
    repeat: { freq: "week", interval: 1, weekdays: [1, 3] },
  },
];

const first = await call("upsert_tasks", { agent, tasks: sync });
check(
  "first sync creates the tasks (or finds them from an earlier run)",
  first.failed === 0 && first.created + first.unchanged === 3,
);
const second = await call("upsert_tasks", { agent, tasks: sync });
check(
  "the same sync again reports every task unchanged",
  second.unchanged === 3 && second.created === 0 && second.updated === 0,
);

const found = await call("search_tasks", { text: "workshop coding", deadlineFrom: "2026-10-25" });
check(
  "search finds both workshops with their due times",
  found.tasks?.length === 2 && found.tasks.every((t) => t.dueTime === 1435 && !/PM|11:55/.test(t.title)),
);

const month = await call("get_range", { start: "2026-10-26", end: "2026-11-25" });
const lectures = month.days?.filter((d) => d.scheduled.some((t) => t.title === "CS101 lecture")).length;
check("get_range shows the class on every Tue and Thu of the month", lectures === 9);

const batch = await call("add_tasks", {
  agent: "Proof run",
  tasks: [
    { text: "Read chapter 5 for CS101 due thu 23:59" },
    { title: "Lab 4", date: "2026-13-40" },
    { title: "Quiz 3 revision", deadline: "2026-11-02", dueTime: 540 },
  ],
});
check(
  "add_tasks adds two and refuses the bad date in place",
  batch.added === 2 && batch.failed === 1 && batch.results[1].error?.includes("date"),
);

const changes = await call("list_changes", { by: "Proof run" });
const run = changes.runs?.[0];
check("list_changes shows the batch as one run", run?.summary === "added 2");

const undone = await call("undo_changes", { agent: "Proof run", runId: run?.runId });
check("undo_changes takes the run back", undone.undone === 2 && undone.failed === 0);
const after = await call("search_tasks", { text: "quiz revision" });
check("the undone tasks are gone", after.tasks?.length === 0);

await client.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
if (failures) process.exit(1);
