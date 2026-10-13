import type { Metadata } from "next";
import Link from "next/link";
import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Kriyan stores, why, who processes it, and how to remove it.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <PlainPage>
      <h1>Privacy</h1>
      <p className={css.lede}>
        Kriyan keeps your plan so you can use it everywhere. It doesn&apos;t sell it, show you ads, or use it
        for anything else. Last updated Mon 12 Oct 2026.
      </p>

      <h2>What Kriyan stores</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and, if you give one, your name. Sign-in is
          handled by Clerk.
        </li>
        <li>
          <strong>Your plan:</strong> tasks, spaces, notes, repeats, reminders, goals, habits and when you
          completed things, plus settings like your time zone and the hours your day runs.
        </li>
        <li>
          <strong>Access tokens:</strong> only a fingerprint (a SHA-256 hash) of each personal access token,
          its name and when it was last used. The token itself is shown to you once and never stored.
        </li>
        <li>
          <strong>Devices:</strong> if you allow notifications on Android, a push token so reminders reach
          your phone.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>Convex stores your plan and runs the backend.</li>
        <li>Clerk handles sign-in and holds your account details.</li>
        <li>Vercel serves this site and the MCP server.</li>
      </ul>
      <p>Each processes your data only to run Kriyan.</p>

      <h2>Your AI assistants</h2>
      <p>
        When you connect an assistant over MCP or give it a token, it can read and change your plan on your
        behalf. What it does with what it reads is governed by that assistant&apos;s own privacy terms. You
        can disconnect it, or revoke its token in Settings, at any time.
      </p>

      <h2>This site</h2>
      <p>
        kriyan.app sets no tracking cookies and runs no analytics. Fonts are served from this site, not from a
        third party.
      </p>

      <h2>Removing your data</h2>
      <p>
        Deleted tasks stay in Trash for 30 days so you can restore them, then they are removed. To delete your
        account and everything in it, or to get a copy of your data, open an issue on{" "}
        <a href={GITHUB_URL}>GitHub</a> asking for a private contact, and we&apos;ll do it.
      </p>

      <h2>Changes</h2>
      <p>
        If this page changes in a way that matters, the change is announced in the app before it takes effect.
        See also the <Link href="/terms">terms</Link>.
      </p>
    </PlainPage>
  );
}
