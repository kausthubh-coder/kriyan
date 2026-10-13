import type { Metadata } from "next";
import Link from "next/link";
import css from "@/components/Prose.module.css";
import { APP_URL, GITHUB_URL, MCP_URL, RELEASES_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How to use Kriyan in the browser, on Android, with your AI through MCP, from the command line and over HTTP.",
  alternates: { canonical: "/docs" },
};

export default function DocsHome() {
  return (
    <article className={css.prose}>
      <h1>Kriyan docs</h1>
      <p className={css.lede}>
        Kriyan turns everything you have to do into a plan for your time. The same plan is in the web app, the
        Android app, your AI assistant and your terminal, and a change in one shows in the others straight
        away.
      </p>

      <h2>Where you can use it</h2>
      <ul>
        <li>
          <strong>On the web:</strong> <a href={APP_URL}>app.kriyan.app</a>. Sign in with your email.
        </li>
        <li>
          <strong>On Android:</strong> install the latest build from{" "}
          <a href={RELEASES_URL}>GitHub releases</a>.
        </li>
        <li>
          <strong>With your AI:</strong> Claude, ChatGPT, Cursor and other MCP clients connect to{" "}
          <code>{MCP_URL}</code>. See <Link href="/docs/mcp">MCP</Link>.
        </li>
        <li>
          <strong>In a terminal:</strong> the <code>kriyan</code> command. See{" "}
          <Link href="/docs/cli">CLI</Link>.
        </li>
        <li>
          <strong>From your own scripts:</strong> one HTTP call per operation. See{" "}
          <Link href="/docs/api">API</Link>.
        </li>
      </ul>

      <h2>The ideas</h2>
      <ul>
        <li>
          <strong>Task:</strong> only the title is needed. A task can also have a space, a date, a time, a
          length, a deadline, repeats, reminders, a goal and a Markdown note. Kriyan never guesses a length.
        </li>
        <li>
          <strong>Event:</strong> a task you attend rather than tick off, like a class or a meeting.
        </li>
        <li>
          <strong>Space:</strong> a coloured place for tasks. Spaces nest as deep as you like, like Work, then
          Kriyan, then Launch.
        </li>
        <li>
          <strong>Proposal:</strong> a block an AI suggested. It waits on Today and Upcoming until you accept
          or discard it.
        </li>
        <li>
          <strong>Goal and habit:</strong> a goal is a target with a date; a habit is something you do a few
          times a week. Missing a day never resets anything.
        </li>
      </ul>

      <h2>Add tasks in one sentence</h2>
      <p>
        Quick add reads dates, times, lengths, repeats, reminders and deadlines from what you type, like{" "}
        <code>essay fri 5pm #school every week remind 1h before</code>. The same words work in the app, the
        CLI and MCP. <Link href="/docs/quick-add">Every phrase quick add understands</Link>.
      </p>

      <h2>Open source</h2>
      <p>
        Kriyan is MIT licensed. The code for the apps, the backend, this site and the MCP server is on{" "}
        <a href={GITHUB_URL}>GitHub</a>.
      </p>
    </article>
  );
}
