import Link from 'next/link'
import type { JSX } from 'react'

import { ArchitectureFlow } from '@/components/architecture-flow'
import { KnowledgeConstellation } from '@/components/knowledge-constellation'

const authorityRows = [
  {
    state: 'Commands, jobs, tasks, reminders',
    home: 'Your Convex deployment',
    note: 'Reactive coordination and product state',
  },
  {
    state: 'People, projects, topics, transcripts',
    home: 'Markdown on your VPS',
    note: 'Readable, cited, durable knowledge',
  },
  {
    state: 'Raw source bytes or references',
    home: 'Source location or VPS vault',
    note: 'Original material and provenance',
  },
  {
    state: 'Search and embeddings',
    home: 'Rebuildable local SQLite',
    note: 'Derived; never the source of truth',
  },
]

export default function HomePage(): JSX.Element {
  return (
    <main id="main-content">
      <section className="hero">
        <div className="hero-copy">
          <div className="release-signal">
            <span aria-hidden="true" />
            Reference deployment · live and verified
          </div>
          <h1>
            Your days, your knowledge, <em>your infrastructure.</em>
          </h1>
          <p className="hero-lede">
            Kriyan connects a daily productivity app to an agent node you operate.
            Your apps react through your Convex deployment; execution, source
            references, readable Markdown, and local search stay on your VPS,
            while original material remains in owner-controlled storage.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/docs/architecture">
              See how the loop works
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-link" href="/docs">
              Open the operator docs
            </Link>
          </div>
          <p className="hero-boundary">
            This public site hosts documentation only. It has no Kriyan account,
            owner workspace, deployment URL, installation ID, or provider session.
          </p>
        </div>
        <KnowledgeConstellation />
      </section>

      <section className="section flow-section" aria-labelledby="flow-heading">
        <div className="section-heading split-heading">
          <div>
            <p className="section-intro">One loop, clear responsibilities</p>
            <h2 id="flow-heading">The app and node meet through Convex.</h2>
          </div>
          <p>
            The app never needs an inbound route to your server. It writes to
            Convex, the node claims work outbound, and subscriptions carry the
            result back to every connected client.
          </p>
        </div>
        <ArchitectureFlow />
      </section>

      <section className="section authority-section" aria-labelledby="authority-heading">
        <div className="authority-copy">
          <p className="section-intro">A second brain you can inspect</p>
          <h2 id="authority-heading">The durable truth stays readable.</h2>
          <p>
            Kriyan keeps four layers distinct: original source material, readable
            Markdown knowledge, a rebuildable SQLite search index, and compact
            Convex projections for clients. A projection never becomes a hidden
            second source of truth.
          </p>
          <Link className="text-link" href="/docs/architecture#storage-boundaries">
            See every storage boundary →
          </Link>
        </div>
        <div className="authority-table-wrap">
          <table className="authority-table">
            <caption>Authority by kind of state</caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Authoritative home</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {authorityRows.map((row) => (
                <tr key={row.state}>
                  <th scope="row">{row.state}</th>
                  <td>{row.home}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section status-section" aria-labelledby="status-heading">
        <div className="section-heading split-heading">
          <div>
            <p className="section-intro">The honest release boundary</p>
            <h2 id="status-heading">Implemented source is not the same as a live release.</h2>
          </div>
          <p>
            The reference deployment has passed its fresh Convex Cloud production,
            Ubuntu VPS, reboot recovery, desktop round-trip, and public-docs gates.
            Distribution and mobile-platform claims remain separate.
          </p>
        </div>

        <div className="status-track">
          <section>
            <h3><span className="status-mark current" />Current</h3>
            <ul>
              <li>Web, Expo mobile, and Tauri desktop clients share product contracts.</li>
              <li>A fresh owner-controlled Convex Cloud production deployment coordinates the live installation.</li>
              <li>An exact-release Tauri desktop command completed through the Ubuntu VPS and returned its reminder to the desktop.</li>
              <li>The systemd node recovered after service restart and host reboot; these docs are deployed publicly.</li>
            </ul>
          </section>
          <section>
            <h3><span className="status-mark planned" />Boundaries</h3>
            <ul>
              <li>No public standalone download URL, signed release, or notarized desktop distribution is advertised.</li>
              <li>Android emulator, physical Android, and iOS runtime behavior remain unverified.</li>
              <li>Hetzner, self-hosted Convex, and provider cloud-firewall configuration require separate proof.</li>
            </ul>
          </section>
        </div>
        <div className="status-actions">
          <Link className="button button-primary" href="/docs/install">
            Read install and CLI guidance
          </Link>
          <Link className="text-link" href="/docs/status">
            See the exact current status
          </Link>
        </div>
      </section>
    </main>
  )
}
