// End-to-end check of the hosted MCP server with the official MCP SDK client:
// lists the tools, reads today, adds a task from a sentence, reads today again, then deletes that task.
//   KRIYAN_TOKEN=kriyan_... node apps/site/scripts/mcp-e2e.mjs http://localhost:3000/mcp [modern|legacy]
// modern speaks the 2026-07-28 protocol; legacy uses the 2025 handshake that older clients send.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.argv[2] ?? "http://localhost:3000/mcp");
const era = process.argv[3] ?? "modern";
const token = process.env.KRIYAN_TOKEN;
if (!token) throw new Error("Set KRIYAN_TOKEN to a personal access token (kriyan_...).");

const client = new Client(
  { name: "kriyan-e2e", version: "1.0.0" },
  { versionNegotiation: { mode: era === "modern" ? { pin: "2026-07-28" } : "legacy" } },
);
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
await client.connect(transport);
console.log(`connected (${era}), protocol ${client.getNegotiatedProtocolVersion?.() ?? "?"}`);
console.log("instructions:", (client.getInstructions?.() ?? "").split("\n")[0]);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`);
for (const tool of tools)
  console.log(
    `  ${tool.name.padEnd(14)} readOnly=${tool.annotations?.readOnlyHint} fields=${Object.keys(tool.inputSchema.properties ?? {}).join(",")}`,
  );

const text = (result) => result.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
const summary = (day) =>
  `date ${day.date}, scheduled ${day.scheduled?.length ?? "?"}, anytime ${day.anytime?.length ?? "?"}, done ${day.done?.length ?? "?"}`;

let result = await client.callTool({ name: "get_today", arguments: {} });
if (result.isError) throw new Error(text(result));
const before = JSON.parse(text(result));
console.log("get_today keys:", Object.keys(before).join(", "));
console.log("get_today before:", summary(before));

const sentence = `MCP e2e check ${Date.now() % 100000} today 16:30 for 20m remind 10m before`;
result = await client.callTool({ name: "add_task", arguments: { text: sentence } });
if (result.isError) throw new Error(text(result));
const added = JSON.parse(text(result));
console.log(`add_task "${sentence}" ->`, JSON.stringify(added));

result = await client.callTool({ name: "get_today", arguments: {} });
const after = JSON.parse(text(result));
console.log("get_today after:", summary(after));
const all = JSON.stringify(after);
const found = all.includes(added.taskId);
console.log("new task is in today's plan:", found);
const task = [...(after.scheduled ?? []), ...(after.anytime ?? [])].find((t) => (t.id ?? t._id ?? t.taskId) === added.taskId);
if (task) console.log("as stored:", JSON.stringify({ title: task.title, date: task.date, time: task.time, length: task.length, reminders: task.reminders }));

result = await client.callTool({ name: "delete_task", arguments: { taskId: added.taskId } });
console.log("delete_task:", result.isError ? `error ${text(result)}` : text(result));

result = await client.callTool({ name: "get_space", arguments: { spaceId: "not-an-id" } });
console.log("bad id gives a tool error:", result.isError, "-", text(result).slice(0, 120));

await client.close();
if (!found) process.exit(1);
