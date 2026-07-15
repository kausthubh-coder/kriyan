import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

import { releaseAssetUrls, releasePageUrl } from '@/lib/release'

export const metadata: Metadata = {
  title: 'Install and standalone CLI',
  description:
    'Download Kriyan V1 apps and standalone node tooling, or install the complete system from source.',
  alternates: { canonical: '/docs/install' },
}

const sourceCommands = `# From a reviewed Kriyan source checkout
bun install --frozen-lockfile
bun run kriyan --help

# Write explicit node configuration (use your own values)
bun run kriyan setup \\
  --convex-url https://<deployment>.convex.cloud \\
  --installation-id <installation-id> \\
  --node-id <node-id> \\
  --data-dir <private-data-directory> \\
  --timezone <iana-timezone> \\
  --locale <bcp47-locale> \\
  --config <private-config-path>
bun run kriyan pair --config <private-config-path>`

const standaloneCommands = `# Download the Linux archive, checksum, and macOS operator CLI
# from v0.1.0. Verify every artifact before use.
sha256sum --check kriyan-node-v0.1.0-linux-x64.tar.gz.sha256
shasum -a 256 --check kriyan-darwin-arm64.sha256
chmod +x kriyan-darwin-arm64

# Inspect the lifecycle before changing a host.
./kriyan-darwin-arm64 --help

# Install over authenticated SSH with strict known-host verification.
./kriyan-darwin-arm64 vps install \\
  --host <host> --user <admin-user> \\
  --identity <ssh-private-key> --known-hosts <known-hosts-file> \\
  --host-key-policy strict \\
  --release kriyan-node-v0.1.0-linux-x64.tar.gz \\
  --checksum kriyan-node-v0.1.0-linux-x64.tar.gz.sha256 \\
  --version <release-commit> --config <private-node-json>`

const dataDirectoryChecks = `# Use the dataDir reported by doctor. The packaged default is shown here.
DATA_DIR=/var/lib/kriyan

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
        <h1>Download V1, or build the same system from source.</h1>
        <p>
          V1 provides direct-download local apps plus standalone node tooling.
          The product stays on your devices, your Convex deployment, and your
          server; only this documentation site is hosted publicly.
        </p>
      </header>

      <aside className="notice notice-cinnabar" aria-label="Distribution status">
        <strong>Direct download, with explicit V1 signing boundaries.</strong>
        <p>
          macOS is ad-hoc signed and not notarized. Android is debug-signed for
          direct installation. Verify checksums from the <a href={releasePageUrl}>release page</a>;
          never pipe an unverified URL into a shell.
        </p>
      </aside>

      <section id="downloads">
        <h2>V1 downloads</h2>
        <dl className="command-list">
          <div><dt><a href={releaseAssetUrls.desktop}>macOS arm64 DMG</a></dt><dd>Local Tauri desktop app for Apple silicon.</dd></div>
          <div><dt><a href={releaseAssetUrls.android}>Android APK</a></dt><dd>Debug-signed direct-install Expo app.</dd></div>
          <div><dt><a href={releaseAssetUrls.nodeLinux}>Linux x64 node archive</a></dt><dd>Standalone CLI and worker for Ubuntu 24.04 x64; Bun is not required on the host.</dd></div>
          <div><dt><a href={releaseAssetUrls.cliDarwin}>Darwin operator CLI</a></dt><dd>Single-file macOS executable for setup and SSH-based VPS lifecycle commands.</dd></div>
        </dl>
      </section>

      <section id="source-install">
        <h2>Install from reviewed source</h2>
        <p>
          Source installation is the editable path for developers. It requires
          Bun and a checkout you trust. These commands do not create a Convex
          project or mutate a provider account by themselves.
        </p>
        <pre className="code-block" aria-label="Source installation commands">
          <code>{sourceCommands}</code>
        </pre>
        <p>
          <code>setup</code> writes JSON configuration only. The CLI also provides
          <code> pair</code>, <code>node run</code>, <code>status</code>,
          <code> doctor</code>, <code>submit</code>, source registration and
          ingestion, search, and index rebuild.
        </p>
      </section>

      <section id="standalone">
        <h2>Install the standalone node on a VPS</h2>
        <p>
          The Linux archive contains Bun-compiled <code>kriyan</code> and
          <code> kriyan-node</code> executables for Ubuntu 24.04 x64. The host
          does not need Bun or Node. The separately downloaded Darwin operator
          performs provider-generic SSH lifecycle operations.
        </p>
        <pre className="code-block" aria-label="Standalone installation outline">
          <code>{standaloneCommands}</code>
        </pre>
        <p>
          The operator verifies artifact identity before the installer creates an
          unprivileged <code>kriyan</code> user, immutable releases under
          <code> /opt/kriyan/releases</code>, private state under
          <code> /var/lib/kriyan</code>, and configuration under
          <code> /etc/kriyan</code>. Never put provider credentials in Convex or
          in the release archive.
        </p>
        <p>
          The reference DigitalOcean service is healthy on the exact promoted node build.
          An earlier attempt failed because the stable node ID could not renegotiate
          its legacy capability list; rollback restored the service, the Convex contract
          was repaired, and the rebuilt candidate later passed promotion health gates.
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
          <div><dt><code>vps</code></dt><dd>Installs, inspects, restarts, updates, rolls back, or removes the packaged node over SSH or locally.</dd></div>
        </dl>
      </section>

      <section id="filesystem-checks">
        <h2>Verify the data directory separately</h2>
        <p>
          Today, <code>doctor</code> does not check whether the reported path
          exists, has the intended owner or mode, is accessible by the service
          user, is writable, or has free capacity. Run these OS-level checks on
          the Ubuntu host.
        </p>
        <pre className="code-block" aria-label="Ubuntu data directory checks">
          <code>{dataDirectoryChecks}</code>
        </pre>
      </section>

      <section id="next">
        <h2>Continue the setup</h2>
        <div className="next-links">
          <Link href="/docs/convex"><span>Create fresh Convex</span>Configure the owner-controlled coordination plane.</Link>
          <Link href="/docs/vps"><span>Prepare the VPS</span>Install, start, inspect, and recover the outbound-only node.</Link>
        </div>
      </section>
    </article>
  )
}
