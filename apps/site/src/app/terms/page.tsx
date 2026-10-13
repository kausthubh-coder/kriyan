import type { Metadata } from "next";
import Link from "next/link";
import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Kriyan.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <PlainPage>
      <h1>Terms</h1>
      <p className={css.lede}>
        Short and plain: use Kriyan to plan your own life, keep your account safe, and don&apos;t abuse the service.
        Last updated Mon 12 Oct 2026.
      </p>

      <h2>The software</h2>
      <p>
        Kriyan&apos;s code is open source under the MIT licence, on <a href={GITHUB_URL}>GitHub</a>. You may run,
        change and share it under that licence. These terms cover the hosted service at kriyan.app and
        app.kriyan.app.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Your plan is yours. Kriyan stores it only to run the service; see the <Link href="/privacy">privacy</Link> page.</li>
        <li>Keep your sign-in and personal access tokens safe. Anyone with a token can read and change your plan.</li>
        <li>You are responsible for what you ask connected assistants to do with your plan.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Don&apos;t try to reach other people&apos;s data, overload the service, or use it to send spam. Accounts that do
        may be suspended.
      </p>

      <h2>No warranty</h2>
      <p>
        Kriyan is provided as it is, without warranty of any kind. Reminders and sync can fail; don&apos;t rely on
        Kriyan alone for anything where a missed reminder could cause harm. To the extent the law allows, Kriyan&apos;s
        authors aren&apos;t liable for losses from using it.
      </p>

      <h2>Changes and ending</h2>
      <p>
        These terms may change; a change that matters is announced in the app before it takes effect. You can stop
        using Kriyan at any time and ask for your account to be deleted.
      </p>
    </PlainPage>
  );
}
