import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'VPS operations',
  description: 'Operate the Kriyan node on a private Ubuntu VPS with provider-generic controls.',
  alternates: { canonical: '/docs/vps' },
}

const inspectCommands = `sudo systemctl is-enabled kriyan-node
sudo systemctl is-active kriyan-node
sudo systemctl status kriyan-node --no-pager
sudo journalctl -u kriyan-node --since '10 minutes ago' --no-pager
sudo -u kriyan /opt/kriyan/current/bin/kriyan doctor \\
  --config /etc/kriyan/node.json`

export default function VpsPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / VPS operations</p>
        <h1>The node dials out. Your server stays private.</h1>
        <p>
          The first live-proof target is DigitalOcean Ubuntu 24.04 x64. The same
          operating model is provider-generic for a comparable Hetzner server,
          but Hetzner is not a verified release target until its own host matrix passes.
        </p>
      </header>

      <section id="host">
        <h2>Prepare the host</h2>
        <dl className="definition-list">
          <div><dt>Image</dt><dd>Fresh Ubuntu 24.04 x64 on a baseline-compatible CPU. Record the provider image and architecture.</dd></div>
          <div><dt>Administration</dt><dd>SSH keys, a non-root administration path, automatic security updates, and provider console recovery.</dd></div>
          <div><dt>Network</dt><dd>Default-deny inbound firewall with SSH restricted to the operator path. Kriyan opens no public application port.</dd></div>
          <div><dt>Outbound</dt><dd>DNS plus HTTPS/WSS access to the selected Convex deployment and any intentionally configured provider endpoints.</dd></div>
          <div><dt>Storage</dt><dd>Private durable space for config, the vault, sessions, journals, and the rebuildable index, with monitored free capacity.</dd></div>
        </dl>
      </section>

      <section id="providers">
        <h2>DigitalOcean and Hetzner</h2>
        <div className="mode-comparison">
          <div>
            <h3>DigitalOcean</h3>
            <p>The accepted reference proof uses a fresh Ubuntu Droplet and passed standalone install, systemd health, host reboot recovery, and a correlated application command.</p>
          </div>
          <div>
            <h3>Hetzner</h3>
            <p>Use an equivalent fresh Ubuntu x64 server and the same OS-level runbook. Do not call it supported until install, reboot, recovery, and round-trip evidence passes there.</p>
          </div>
        </div>
      </section>

      <aside className="notice notice-saffron">
        <strong>Host proof is not cloud-firewall proof.</strong>
        <p>
          Kriyan opened no inbound application port and did not weaken SSH policy.
          The reference run did not have an authenticated provider firewall API,
          so it does not claim a verified DigitalOcean Cloud Firewall resource.
        </p>
      </aside>

      <section id="operate">
        <h2>Inspect the running service</h2>
        <pre className="code-block" aria-label="VPS inspection commands"><code>{inspectCommands}</code></pre>
        <p>
          Healthy means more than an active process: the service must emit a new
          heartbeat from the expected release and process instance after restart,
          remain stable, and complete a real command. Sanitize journals before
          sharing them; paths, source content, and provider output may be private.
        </p>
      </section>

      <section id="recovery">
        <h2>Recovery order</h2>
        <ol className="install-steps">
          <li><strong>Preserve evidence.</strong> Record release identity, service state, disk space, and a bounded sanitized journal.</li>
          <li><strong>Separate transport from execution.</strong> Check DNS and Convex reachability before blaming the runtime.</li>
          <li><strong>Restart once and verify identity.</strong> Require a post-restart heartbeat from a new process, not a stale record.</li>
          <li><strong>Roll back if the release is at fault.</strong> Restore the previous immutable release and run the same health gate.</li>
          <li><strong>Restore data only when necessary.</strong> Validate a backup into an empty temporary directory before replacing durable state.</li>
        </ol>
        <p>Continue with <Link href="/docs/updates">update and rollback</Link> or <Link href="/docs/troubleshooting">boundary-by-boundary diagnosis</Link>.</p>
      </section>
    </article>
  )
}
