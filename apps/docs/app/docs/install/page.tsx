import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Install and standalone CLI',
  description:
    'Install Kriyan from the integrated source today, and understand the standalone Linux CLI and node release boundary.',
  alternates: { canonical: '/docs/install' },
}

const sourceCommands = `# From a reviewed Kriyan source checkout
bun install --frozen-lockfile
bun run typecheck:node
bun run test:node

# Inspect the real command surface
bun run kriyan --help

# Write explicit node configuration (use your own values)
bun run kriyan setup \\
  --convex-url https://<deployment>.convex.cloud \\
  --installation-id <installation-id> \\
  --node-id <node-id> \\
  --data-dir <private-data-directory> \\
  --timezone <iana-timezone> \\
  --locale <bcp47-locale> \\
  --config <private-config-path>`

const standaloneCommands = `# This is the verified archive shape, not a public download URL.
# Start only after obtaining a release archive and checksum from a trusted release.
sha256sum --check kriyan-node-<version>.tar.gz.sha256

# The archive carries standalone Linux x64 CLI and node executables.
# The repository's installer verifies the archive again before activation.
sudo KRIYAN_VERSION=<version> \\
  packaging/scripts/install.sh kriyan-node-<version>.tar.gz

# Add a private JSON config, then enable the service.
sudo systemctl enable --now kriyan-node
sudo systemctl status kriyan-node --no-pager`

const dataDirectoryChecks = `# Use the dataDir reported by doctor. The packaged default is shown here.
DATA_DIR=/var/lib/kriyan

# Existence, expected owner/group/mode, and effective service-user access.
sudo test -d "$DATA_DIR"
sudo test "$(stat -c '%U:%G:%a' "$DATA_DIR")" = 'kriyan:kriyan:700'
sudo -u kriyan test -r "$DATA_DIR"
sudo -u kriyan test -w "$DATA_DIR"
sudo -u kriyan test -x "$DATA_DIR"

# Prove a real create/remove cycle, then inspect byte and inode capacity.
sudo -u kriyan sh -c 'probe="$1/.kriyan-write-check.$$"; : > "$probe" && rm -f "$probe"' sh "$DATA_DIR"
df -h -- "$DATA_DIR"
df -i -- "$DATA_DIR"`

export default function InstallPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Install & CLI</p>
        <h1>Two install paths, with one live reference deployment.</h1>
        <p>
          The integrated repository can be installed and exercised from source.
          Standalone Linux x64 binaries, immutable release archives, and systemd
          scripts also power the verified Ubuntu reference deployment. This site
          does not publish a general download URL or advertise a signed release.
        </p>
      </header>

      <aside className="notice notice-cinnabar" aria-label="Distribution status">
        <strong>No public installer is advertised here.</strong>
        <p>
          Do not pipe an unverified URL into a shell. A standalone install begins
          with a pinned archive, its checksum and provenance, and release notes
          that identify the exact tested commit and platform.
        </p>
      </aside>

      <section id="source-install">
        <h2>Install from reviewed source</h2>
        <p>
          Source installation remains the available path for developers who do
          not possess the verified reference archive. It requires Bun and a checkout you trust. These commands do
          not create a Convex project or mutate a provider account by themselves.
        </p>
        <pre className="code-block" aria-label="Source installation commands">
          <code>{sourceCommands}</code>
        </pre>
        <p>
          <code>setup</code> writes JSON configuration only. The current CLI also
          provides <code>pair</code>, <code>node run</code>, <code>status</code>,
          <code>doctor</code>, <code>submit</code>, source registration and ingestion,
          search, and index rebuild. Run <code>--help</code> from the exact checkout
          instead of relying on copied command lists.
        </p>
      </section>

      <section id="standalone">
        <h2>The standalone Linux boundary</h2>
        <p>
          The release archive contains two Bun-compiled ELF executables:
          <code>kriyan</code> for operator commands and <code>kriyan-node</code> for
          the long-running worker. The target is Ubuntu 24.04 x64 with baseline
          CPU compatibility; other operating systems and architectures need their
          own artifacts and evidence.
        </p>
        <pre className="code-block" aria-label="Standalone installation outline">
          <code>{standaloneCommands}</code>
        </pre>
        <p>
          The archive installer creates an unprivileged <code>kriyan</code> user,
          immutable releases under <code>/opt/kriyan/releases</code>, a
          <code>/opt/kriyan/current</code> symlink, private state under
          <code>/var/lib/kriyan</code>, and configuration under
          <code>/etc/kriyan</code>. Never put provider credentials in Convex or in
          the release archive.
        </p>
      </section>

      <section id="cli-reference">
        <h2>Current CLI roles</h2>
        <dl className="command-list">
          <div><dt><code>setup</code></dt><dd>Validates and saves explicit JSON node configuration.</dd></div>
          <div><dt><code>pair</code></dt><dd>Creates the configured installation record; it is not a finished QR enrollment flow.</dd></div>
          <div><dt><code>node run</code></dt><dd>Starts the worker against the configured coordination plane.</dd></div>
          <div><dt><code>status</code></dt><dd>Lists observed nodes and derived health.</dd></div>
          <div><dt><code>doctor</code></dt><dd>Checks loaded config, Convex reachability, and the configured node’s derived health. It reports the configured data directory path but does not inspect that directory.</dd></div>
          <div><dt><code>submit</code></dt><dd>Queues text with an optional idempotency key.</dd></div>
          <div><dt><code>source register</code></dt><dd>Registers a Git, GitHub, Drive, local, or web source in the vault.</dd></div>
          <div><dt><code>ingest</code></dt><dd>Writes cited person, project, or topic knowledge from a registered source.</dd></div>
          <div><dt><code>search</code></dt><dd>Runs lexical or optional hybrid retrieval with citations.</dd></div>
          <div><dt><code>index rebuild</code></dt><dd>Recreates the derived SQLite index from the vault.</dd></div>
        </dl>
      </section>

      <section id="filesystem-checks">
        <h2>Verify the data directory separately</h2>
        <p>
          Today, <code>doctor</code> does not check whether the reported path
          exists, has the intended owner or mode, is accessible by the service
          user, is writable, or has free capacity. On the packaged Ubuntu host,
          run these OS-level checks separately. Replace the default path when
          your configuration reports a different one.
        </p>
        <pre className="code-block" aria-label="Ubuntu data directory checks">
          <code>{dataDirectoryChecks}</code>
        </pre>
        <p>
          The write probe creates and removes one temporary file as the
          unprivileged <code>kriyan</code> user. Treat a failed command or low
          byte/inode capacity as an operational failure even if <code>doctor</code>
          reports healthy Convex and node checks.
        </p>
      </section>

      <section id="next">
        <h2>Continue the setup</h2>
        <div className="next-links">
          <Link href="/docs/convex"><span>Create fresh Convex</span>Configure the coordination plane without copying private values into docs.</Link>
          <Link href="/docs/vps"><span>Prepare the VPS</span>Install, start, inspect, and recover the outbound-only node.</Link>
        </div>
      </section>
    </article>
  )
}
