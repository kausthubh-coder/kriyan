import Link from 'next/link'
import type { JSX } from 'react'

import { ArchitectureFlow } from '@/components/architecture-flow'
import { KnowledgeConstellation } from '@/components/knowledge-constellation'
import { releaseAssetUrls, releasePageUrl } from '@/lib/release'

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
            Open-source V1 · direct download
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
            <a className="text-link" href={releasePageUrl}>Download V1</a>
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
            <h2 id="status-heading">Download the apps; operate the infrastructure.</h2>
          </div>
          <p>
            V1 packages the local product clients and node tooling. The existing
            DigitalOcean service remains healthy on its prior release. The candidate
            exposed immutable node-registration data and rolled back safely.
          </p>
        </div>

        <div className="status-track">
          <section>
            <h3><span className="status-mark current" />Current</h3>
            <ul>
              <li>Web, Expo mobile, and Tauri desktop clients share product contracts.</li>
              <li><a href={releaseAssetUrls.desktop}>macOS arm64 DMG</a> and <a href={releaseAssetUrls.android}>Android APK</a> are direct-download V1 apps.</li>
              <li><a href={releaseAssetUrls.nodeLinux}>Linux x64 node archive</a> and <a href={releaseAssetUrls.cliDarwin}>Darwin operator CLI</a> support owner-operated nodes.</li>
              <li>Only this landing page and documentation are hosted publicly.</li>
            </ul>
          </section>
          <section>
            <h3><span className="status-mark planned" />Boundaries</h3>
            <ul>
              <li>macOS is ad-hoc signed and not notarized; Android is debug-signed for direct installation.</li>
              <li>The candidate is not promoted yet: its stable node identity needs capability renegotiation first.</li>
              <li>A complete visible live Agent chat round trip, iOS, Hetzner, and self-hosted Convex remain unproven.</li>
            </ul>
          </section>
        </div>
        <div className="status-actions">
          <Link className="button button-primary" href="/docs/install">
            Install apps and CLI
          </Link>
          <Link className="text-link" href="/docs/status">
            See the exact current status
          </Link>
        </div>
      </section>
    </main>
  )
}
