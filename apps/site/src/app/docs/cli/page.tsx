import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/Code";
import css from "@/components/Prose.module.css";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "CLI",
  description:
    "Plan your days with Kriyan from a terminal: today, the week, quick add, and JSON for scripts.",
  alternates: { canonical: "/docs/cli" },
};

const COMMANDS: { group: string; rows: [string, string][] }[] = [
  {
    group: "See your plan",
    rows: [
      ["today [date]", "Now and next, the schedule, anytime tasks, habits and free time"],
      ["week [start]", "Seven days from Monday, or from the date you give"],
      ["inbox", "Tasks without a date or a space"],
      ["spaces", "Your spaces as a tree"],
      ["progress", "Time done, goals and habits"],
    ],
  },
  {
    group: "Change it",
    rows: [
      ["add <sentence>", "Add a task the way you'd say it"],
      ["done <task>", "Tick a task off"],
      ["move <task...> <when>", "Move tasks to another day or time"],
      ["rm <task>", "Delete a task; restore it from the app"],
      ["habit <name>", "Check a habit for today, or uncheck it with --undo"],
      ["propose", "Propose time blocks from a file for you to accept in the app"],
    ],
  },
  {
    group: "Account and agents",
    rows: [
      ["login", "Save a personal access token from Settings"],
      ["logout", "Remove the saved token"],
      ["call <op> [json]", "Run any operation of the agent API"],
      ["ops", "List the operations"],
    ],
  },
];

export default function CliDocs() {
  return (
    <article className={css.prose}>
      <h1>The kriyan command</h1>
      <p className={css.lede}>
        Everything you can see and change in Kriyan, from a terminal. Add <code>--json</code> to any command
        for output a script or an agent can read.
      </p>

      <h2 id="install">Install</h2>
      <p>
        The CLI runs on <a href="https://bun.sh">Bun</a>. Until it is published as a package, run it from the
        source:
      </p>
      <Code caption="Terminal">{`git clone ${GITHUB_URL}\ncd kriyan\nbun install\nbun run kriyan --help`}</Code>

      <h2 id="sign-in">Sign in</h2>
      <p>
        In Kriyan, open Settings and create a personal access token named after this computer. Then save it:
      </p>
      <Code caption="Terminal">{`kriyan login\n# or\nkriyan login --token kriyan_...`}</Code>
      <p>
        The token is checked before it is saved, and kept only on this computer. <code>kriyan logout</code>{" "}
        removes it; revoke it in Settings to stop it working everywhere.
      </p>

      <h2 id="examples">Examples</h2>
      <Code caption="Terminal">
        {`kriyan today
kriyan week
kriyan add "essay fri 5pm #school every week remind 1h before"
kriyan add "calculus lecture every tue and thu 10:00-11:30 #school"
kriyan done 2
kriyan move 3 5 tomorrow 9am
kriyan today --json`}
      </Code>
      <p>
        A task is the number shown next to it in your last listing, part of its title, or its id.{" "}
        <code>add</code> reads the same phrases as <Link href="/docs/quick-add">quick add</Link> in the app.
      </p>

      <h2 id="commands">Commands</h2>
      {COMMANDS.map((group) => (
        <section key={group.group} className={css.section} aria-label={group.group}>
          <h3>{group.group}</h3>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <tbody>
                {group.rows.map(([command, what]) => (
                  <tr key={command}>
                    <td>
                      <code>{command}</code>
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p>
        <code>kriyan &lt;command&gt; --help</code> shows the options and examples for each command.
      </p>

      <h2 id="environment">Environment</h2>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <tbody>
            <tr>
              <td>
                <code>KRIYAN_TOKEN</code>
              </td>
              <td>Use this token instead of the saved one, for scripts and CI.</td>
            </tr>
            <tr>
              <td>
                <code>KRIYAN_API_URL</code>
              </td>
              <td>Talk to another Kriyan server. The default is https://kriyan.app.</td>
            </tr>
            <tr>
              <td>
                <code>NO_COLOR</code>
              </td>
              <td>Leave out the coloured space dots.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Exit codes: 0 when it worked, 1 when Kriyan refused the change, 2 for a usage or network problem.</p>
    </article>
  );
}
