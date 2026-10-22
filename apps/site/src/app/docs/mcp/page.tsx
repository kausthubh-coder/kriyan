import type { Metadata } from "next";
import Link from "next/link";
import { OPS } from "@kriyan/core/ops";
import { Code } from "@/components/Code";
import css from "@/components/Prose.module.css";
import { MCP_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "MCP",
  description: "Connect Claude, ChatGPT, Cursor or any MCP client to your Kriyan plan.",
  alternates: { canonical: "/docs/mcp" },
};

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
                  {op.description}
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
