import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Troubleshooting',
  description: 'Diagnose Kriyan from app to Convex to VPS to vault without exposing secrets.',
  alternates: { canonical: '/docs/troubleshooting' },
}

export default function TroubleshootingPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Troubleshooting</p>
        <h1>Find the broken boundary before changing state.</h1>
        <p>
          Kriyan’s simple loop makes diagnosis concrete: app → Convex → VPS →
          Convex → app. Check one handoff at a time and preserve identifiers and
          timestamps without copying secrets or private content into evidence.
        </p>
      </header>

      <section id="matrix">
        <h2>Symptom to first check</h2>
        <div className="wide-table-wrap">
          <table>
            <thead><tr><th scope="col">Symptom</th><th scope="col">First boundary</th><th scope="col">Safe evidence</th></tr></thead>
            <tbody>
              <tr><th scope="row">App stays offline</th><td>App → Convex</td><td>Local mode, URL shape, browser network/console, connection timestamp</td></tr>
              <tr><th scope="row">Command remains queued</th><td>Convex → VPS</td><td>Installation ID match, latest heartbeat age, node status</td></tr>
              <tr><th scope="row">Run starts then stalls</th><td>VPS runtime/effects</td><td>Run ID, ordered event types, bounded sanitized journal</td></tr>
              <tr><th scope="row">Result exists but app is stale</th><td>Convex → app</td><td>Subscription recovery state, connection generation, page reload behavior</td></tr>
              <tr><th scope="row">Search misses known Markdown</th><td>Vault → SQLite</td><td>Source ID, document revision, lexical result, rebuild result</td></tr>
              <tr><th scope="row">Hybrid search degrades</th><td>Embedding provider</td><td>Endpoint reachability and stable error code; retry lexical mode</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="diagnostic-order">
        <h2>A bounded diagnostic order</h2>
        <ol className="install-steps">
          <li><strong>Confirm local mode.</strong> An offline demo intentionally makes no Convex connection.</li>
          <li><strong>Validate identifiers.</strong> The app and node must use the same deployment URL and installation ID.</li>
          <li><strong>Check transport.</strong> Verify DNS, TLS/WSS, and an actual Convex subscription before restarting services.</li>
          <li><strong>Check current heartbeat.</strong> A stale online record is not a running node.</li>
          <li><strong>Follow one command ID.</strong> Correlate its job, run, events, and result instead of comparing unrelated attempts.</li>
          <li><strong>Use the recovery designed for the layer.</strong> Reconnect the app, restart/rollback the node, or rebuild SQLite—do not mix them.</li>
        </ol>
      </section>

      <aside className="notice notice-cinnabar">
        <strong>Redact before sharing.</strong>
        <p>
          Never publish deployment URLs, installation IDs, deploy keys, SSH
          material, IP addresses, provider sessions, raw vault data, or full
          journals. Prefer stable error codes, record IDs, event types, relative
          times, and sanitized excerpts.
        </p>
      </aside>

      <section id="next">
        <h2>Recovery references</h2>
        <div className="next-links">
          <Link href="/docs/vps"><span>VPS operations</span>Inspect the systemd service and heartbeat identity.</Link>
          <Link href="/docs/updates"><span>Update & rollback</span>Return to the previous immutable release safely.</Link>
        </div>
      </section>
    </article>
  )
}
