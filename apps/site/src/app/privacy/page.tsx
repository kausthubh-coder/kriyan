import Link from "next/link";
import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import { GITHUB_URL } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy",
  heading: "Privacy",
  description: "What Kriyan stores, why, who processes it, and how to remove it.",
});

export default function Privacy() {
  return (
    <PlainPage>
      <h1>Privacy</h1>
      <p className={css.lede}>
        Kriyan keeps your plan so you can use it everywhere. It doesn&apos;t sell it, show you ads, or use it
        for anything else. Last updated Sat 24 Oct 2026.
      </p>

      <h2>What Kriyan stores</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and, if you give one, your name. Sign-in is
          handled by Clerk. If you sign in with Google, Clerk also receives the name and profile photo on your
          Google account.
        </li>
        <li>
          <strong>Your plan:</strong> tasks and their steps, spaces, notes, repeats, reminders, goals, habits,
          when you completed things and the focus time you logged, plus settings like your time zone and the
          hours your day runs.
        </li>
        <li>
          <strong>Ask and your agents:</strong> what you type in Ask and the replies to it, and a list of the
          changes your connected agents made, so each one can be undone.
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
        <li>Expo sends push notifications to your phone, so reminders arrive.</li>
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
        Deleted tasks stay in Recently deleted for 30 days so you can restore them, then they are removed. To
        delete your account and everything in it, open Settings and choose Delete my data. To get a copy of
        your data, open an issue on <a href={GITHUB_URL}>GitHub</a> asking for a private contact, and
        we&apos;ll send it.
      </p>

      <h2>Changes</h2>
      <p>
        If this page changes in a way that matters, the change is announced in the app before it takes effect.
        See also the <Link href="/terms">terms</Link>.
      </p>
    </PlainPage>
  );
}
