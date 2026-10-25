import Link from "next/link";
import { OPS } from "@kriyan/core/ops";
import { Code } from "@/components/Code";
import { OpDescription } from "@/components/OpDescription";
import css from "@/components/Prose.module.css";
import { MCP_URL } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  path: "/docs/mcp",
  title: "MCP",
  heading: "Plan with your AI over MCP",
  description: "Connect Claude, ChatGPT, Codex, Cursor or any MCP client to your Kriyan plan.",
});

const cursorConfig = JSON.stringify({ mcpServers: { kriyan: { url: MCP_URL } } }, null, 2);
const tokenConfig = JSON.stringify(
  { mcpServers: { kriyan: { url: MCP_URL, headers: { Authorization: "Bearer kriyan_..." } } } },
  null,
  2,
);
const vscodeConfig = JSON.stringify({ servers: { kriyan: { type: "http", url: MCP_URL } } }, null, 2);

export default function McpDocs() {
  return (
    <article className={css.prose}>
      <h1>Plan with your AI over MCP</h1>
      <p className={css.lede}>
        Kriyan runs a hosted MCP server. Connect it once and your assistant can read your day and week,
        capture tasks, and propose plans you accept in the app.
      </p>
      <Code caption="MCP server address">{MCP_URL}</Code>
      <p>
        It speaks streamable HTTP, protocol 2026-07-28, and the 2025 versions older clients use. There is
        nothing to install.
      </p>

      <h2 id="connect">Connect</h2>
      <h3>Claude and ChatGPT</h3>
      <p>
        Add a custom connector with the address above. When asked, sign in to Kriyan and allow access. The
        connector acts as you and only ever sees your own plan.
      </p>
      <h3>Claude Code</h3>
      <Code caption="Terminal">{`claude mcp add --transport http --scope user kriyan ${MCP_URL}`}</Code>
      <p>
        Then run <code>/mcp</code> in Claude Code and choose Kriyan to sign in.
      </p>
      <h3>Cursor</h3>
      <p>
        Add this to <code>~/.cursor/mcp.json</code>, or to <code>.cursor/mcp.json</code> in one project.
      </p>
      <Code caption="mcp.json">{cursorConfig}</Code>
      <h3>VS Code</h3>
      <p>
        Add this to <code>.vscode/mcp.json</code>.
      </p>
      <Code caption=".vscode/mcp.json">{vscodeConfig}</Code>

      <h2 id="tokens">Use a personal access token</h2>
      <p>
        Clients that can&apos;t sign in, and your own scripts, can send a token instead. Create one in Kriyan
        under Settings, name it after where you&apos;ll use it, and send it as a bearer token. You can revoke
        it there at any time.
      </p>
      <Code caption="mcp.json with a token">{tokenConfig}</Code>
      <Code caption="Claude Code with a token">
        {`claude mcp add --transport http --scope user kriyan ${MCP_URL} --header "Authorization: Bearer kriyan_..."`}
      </Code>
      <p>
        Keep tokens out of shared files and repositories: anyone with a token can read and change your plan.
      </p>

      <h2 id="how-agents-plan">How agents plan with you</h2>
      <ul>
        <li>
          Agents read first. The server tells them to call <code>get_today</code> or <code>get_week</code>{" "}
          before suggesting anything about your time.
        </li>
        <li>
          Plans arrive as proposals. <code>propose_plan</code> puts blocks on Today and Upcoming, names the
          agent, and waits for you to accept or discard them on Upcoming, unless you turn on &ldquo;Let agents
          edit directly&rdquo; in Settings. Other changes, like <code>update_task</code>,{" "}
          <code>move_tasks</code> and <code>delete_task</code>, apply right away.
        </li>
        <li>Agents never guess how long something takes. A length is only set when you said one.</li>
        <li>
          Agents find tasks with <code>search_tasks</code> (by words, space, dates, status or the agent that
          added them) instead of reading whole weeks, and read up to 62 days at once with{" "}
          <code>get_range</code>.
        </li>
        <li>
          Agents work in batches. <code>add_tasks</code>, <code>update_tasks</code>,{" "}
          <code>complete_tasks</code>, <code>delete_tasks</code> and <code>restore_tasks</code> take up to 100
          tasks in one call, and say for each one what was saved or why it was refused.
        </li>
        <li>
          An agent that syncs from somewhere else, like coursework from Moodle, gives each task the
          source&apos;s id and calls <code>upsert_tasks</code> each time. A new item is added, a changed one
          updated, and the same sync again changes nothing, so you never get duplicates. A task you deleted
          stays deleted.
        </li>
        <li>
          A due time has its own field. &ldquo;Workshop 8 coding, due Fri 30 Oct at 23:55&rdquo; is saved as a
          deadline and a due time, never in the title, and shows as &ldquo;Due Fri 30 Oct, 23:55&rdquo;.
        </li>
        <li>
          Kriyan has no AI of its own. In Ask, the app does a few things by itself, like adding a task or
          finding free time; anything else waits for your agent. <code>get_asks</code> lists what is waiting,
          and <code>answer_ask</code> replies under the request once the agent has done it.
        </li>
        <li>
          Every change an agent makes is listed in the app with the agent&apos;s name, and each one has Undo.
          An agent can see its own runs with <code>list_changes</code> and take one back with{" "}
          <code>undo_changes</code>.
        </li>
        <li>
          Agents can build your routines. <code>add_routine</code> makes one block of small parts, like a
          morning routine at 07:00; a part can be a habit, and <code>tick_routine</code> ticks a part and
          checks the habit with it, so it still counts toward the habit&apos;s week and its goal.
        </li>
        <li>
          Agents log goals and link what feeds them. <code>log_goal</code> records where a goal stands, like
          &ldquo;$1,240 saved&rdquo;, for its trend line; a habit or task feeds a goal through its{" "}
          <code>goalId</code>. A study session takes the exam it prepares for in <code>prepFor</code>, and
          shows how many days are left.
        </li>
        <li>
          Captured tasks use the same words as quick add, so an agent can pass your sentence as it is. See{" "}
          <Link href="/docs/quick-add">Quick add</Link>.
        </li>
      </ul>

      <h2 id="tools">Tools</h2>
      <p>
        One tool for each operation of the <Link href="/docs/api">agent API</Link>. Read tools are marked
        read-only, so clients can run them without asking.
      </p>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {OPS.map((op) => (
              <tr key={op.name}>
                <td>
                  <code>{op.name}</code>
                </td>
                <td>
                  <OpDescription text={op.description} />
                  {op.kind === "read" ? " Read-only." : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="try">Things to ask</h2>
      <ul>
        <li>&ldquo;What&apos;s on my plate today, and what&apos;s next?&rdquo;</li>
        <li>&ldquo;Does my week fit? Move what doesn&apos;t to next week.&rdquo;</li>
        <li>&ldquo;Plan time for the essay before Friday around my classes.&rdquo;</li>
        <li>&ldquo;Add: Mum&apos;s birthday 16 oct every year, remind day before at 20:00.&rdquo;</li>
        <li>&ldquo;Sync my Moodle assignments into the School space, with their due times.&rdquo;</li>
        <li>&ldquo;What did you change this morning? Undo it.&rdquo;</li>
        <li>&ldquo;Make me a morning routine at 7: brush teeth, meditate 10 min, gym on weekdays.&rdquo;</li>
        <li>&ldquo;I&apos;ve saved $1,240 now. Log it.&rdquo;</li>
      </ul>

      <h2 id="trouble">If it doesn&apos;t connect</h2>
      <ul>
        <li>
          <strong>401 from the server:</strong> the sign-in expired or the token was revoked. Connect again,
          or create a new token in Settings.
        </li>
        <li>
          <strong>The client can&apos;t find sign-in:</strong> it reads{" "}
          <code>/.well-known/oauth-protected-resource/mcp</code> to find Kriyan&apos;s sign-in server. Use a
          token if your client doesn&apos;t support MCP sign-in yet.
        </li>
        <li>
          <strong>Opening the address in a browser</strong> brings you to this page. MCP clients connect with
          POST.
        </li>
      </ul>
    </article>
  );
}
