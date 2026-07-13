import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Update and rollback',
  description: 'Update Kriyan atomically, verify release identity, and roll back without hiding data risk.',
  alternates: { canonical: '/docs/updates' },
}

const updateCommands = `# Verify a new pinned archive before use.
sha256sum --check kriyan-node-<new-version>.tar.gz.sha256

# The update script installs immutably, switches the current symlink,
# restarts, and restores the previous release if health fails.
sudo packaging/scripts/update.sh kriyan-node-<new-version>.tar.gz

# Roll back to an already installed immutable release.
sudo packaging/scripts/rollback.sh <previous-version>`

export default function UpdatesPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Update & rollback</p>
        <h1>Change code atomically. Treat data separately.</h1>
        <p>
          Kriyan’s Linux packaging keeps immutable releases and switches a
          <code>current</code> symlink. Release rollback is fast; schema or vault
          recovery is a different operation and must not be implied by a binary switch.
        </p>
      </header>

      <section id="before">
        <h2>Before an update</h2>
        <ul className="check-list">
          <li>Record the current release, process instance, latest healthy heartbeat, and Git provenance.</li>
          <li>Verify the new archive checksum and embedded source/build provenance.</li>
          <li>Create and validate a private backup when the release changes durable data.</li>
          <li>Read schema and compatibility notes; a binary rollback cannot undo incompatible data migration.</li>
          <li>Keep the previous immutable release installed until the new health gate passes.</li>
        </ul>
      </section>

      <section id="commands">
        <h2>Update and rollback commands</h2>
        <pre className="code-block" aria-label="Update and rollback command outline"><code>{updateCommands}</code></pre>
        <p>
          Health requires a heartbeat newer than the restart boundary from a
          different process instance running the expected release, followed by a
          stability window. An old but recent heartbeat must not pass.
        </p>
      </section>

      <section id="verify">
        <h2>After update or rollback</h2>
        <ol className="event-sequence">
          <li><strong>Verify systemd.</strong> The unit is enabled and active.</li>
          <li><strong>Verify identity.</strong> The new process reports the expected release.</li>
          <li><strong>Run doctor.</strong> Loaded config, Convex reachability, and the configured node’s derived health pass; record the reported data directory path.</li>
          <li><strong>Inspect storage separately.</strong> Run the <Link href="/docs/install#filesystem-checks">Ubuntu data-directory checks</Link> for existence, ownership, mode, service-user access, writability, and capacity.</li>
          <li><strong>Submit a namespaced command.</strong> Observe one complete app-to-node-to-app round trip.</li>
          <li><strong>Reboot when validating a release.</strong> Repeat identity and command proof after host restart.</li>
        </ol>
      </section>

      <aside className="notice notice-saffron">
        <strong>Backups are evidence only after restore validation.</strong>
        <p>
          Validate archive safety and restore into an empty temporary directory.
          Confirm expected ownership and contents before touching the active data
          directory. Do not place backups in public build or docs artifacts.
        </p>
      </aside>
    </article>
  )
}
