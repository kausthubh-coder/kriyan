import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

import { releaseAssetUrls } from '@/lib/release'

export const metadata: Metadata = {
  title: 'Desktop connection',
  description: 'Connect the Kriyan desktop app to an owner-controlled Convex deployment and installation.',
  alternates: { canonical: '/docs/desktop' },
}

export default function DesktopPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Desktop connection</p>
        <h1>Download the local app, then connect it to your Convex.</h1>
        <p>
          The Tauri desktop app uses the same static Next.js product surface as
          the web client. Its local profile stores non-secret runtime preferences;
          the node independently connects to Convex to claim work.
        </p>
      </header>

      <aside className="notice notice-cinnabar" aria-label="Desktop download">
        <strong><a href={releaseAssetUrls.desktop}>Download the macOS arm64 DMG.</a></strong>
        <p>
          The V1 app is ad-hoc signed and strictly sealed, but it has no Apple
          Developer ID signature and is not notarized. Control-click the app and
          choose <strong>Open</strong> if macOS blocks the first normal launch.
        </p>
      </aside>

      <section id="configure">
        <h2>Configure the local profile</h2>
        <ol className="install-steps">
          <li><strong>Install the app.</strong> Mount the DMG, drag Kriyan to Applications, and complete the first-open step.</li>
          <li><strong>Open Settings.</strong> Turn off Offline demo for a real connection.</li>
          <li><strong>Enter the Convex deployment URL.</strong> Use the URL from your private deployment configuration, not a value copied from public docs.</li>
          <li><strong>Enter the installation ID.</strong> It must match the installation created by your CLI/node setup.</li>
          <li><strong>Save local settings.</strong> The runtime reloads these preferences in the current app profile.</li>
          <li><strong>Verify state, then submit intent.</strong> Confirm connection and node health before using a command result as end-to-end proof.</li>
        </ol>
      </section>

      <aside className="notice notice-saffron">
        <strong>These preferences are identifiers, not node credentials.</strong>
        <p>
          The Convex URL, installation ID, display name, and demo toggle are stored
          in the app profile. Deploy keys, SSH keys, provider sessions, and node
          secrets must never be entered into the desktop settings surface.
        </p>
      </aside>

      <section id="proof">
        <h2>What a real round trip proves</h2>
        <p>
          A complete proof submits one known command from the built desktop app,
          observes matching command, job, run, and ordered event identities in
          Convex, captures the node’s matching sanitized journal, and shows the
          returned result in the desktop UI. Repeat after a service restart and
          host reboot to prove recovery rather than a one-off happy path.
        </p>
        <ul className="check-list">
          <li>The app and node use the same unique installation ID.</li>
          <li>The node heartbeat names the expected release and a current process instance.</li>
          <li>The result arrives through Convex subscriptions without a direct VPS address in the app.</li>
          <li>A duplicate idempotency key does not duplicate durable work.</li>
          <li>A temporary node stop leaves queued work visible and recovery completes it.</li>
        </ul>
        <p>
          The promoted node candidate and local browser client proved
          the complete Agent → Convex → Ubuntu VPS → Convex → Agent path with the
          deterministic runtime. The exact packaged Tauri app has not repeated that
          live Agent proof, so keep browser-client and packaged-desktop evidence distinct.
          Check <Link href="/docs/status">current status</Link> for the exact boundary.
        </p>
      </section>
    </article>
  )
}
