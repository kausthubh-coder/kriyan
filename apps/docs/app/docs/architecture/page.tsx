import type { Metadata } from 'next'
import type { JSX } from 'react'

import { ArchitectureFlow } from '@/components/architecture-flow'

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'How Kriyan’s clients, owner-controlled Convex deployment, VPS agent node, Pi runtime, Markdown vault, and rebuildable index fit together.',
  alternates: { canonical: '/docs/architecture' },
}

const storageRows = [
  ['Commands, jobs, runs', 'Convex', 'Durable, reactive coordination'],
  ['Tasks, reminders, automations', 'Convex', 'Product and time state'],
  ['Device and node records', 'Convex', 'Capabilities and heartbeat'],
  ['Source registry', 'Markdown vault', 'Stable references and provenance'],
  ['People, projects, topics', 'Markdown vault', 'Authoritative cited knowledge'],
  ['Normalized transcripts', 'Markdown vault', 'Readable durable representation'],
  ['Raw source material', 'Original location or vault', 'Bytes or a pinned source reference'],
  ['Pi sessions and effect journal', 'VPS data directory', 'Recovery and durable effects'],
  ['Lexical and optional vector search', 'Local SQLite', 'Rebuildable derived index'],
  ['Source and knowledge summaries', 'Convex', 'Compact reactive client projections'],
]

export default function ArchitecturePage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Architecture</p>
        <h1>One meeting point. No hidden second authority.</h1>
        <p>
          Clients and the agent node never call one another. They communicate
          through the owner’s Convex deployment. Execution, provider credentials,
          sessions, vault Markdown, and the local index stay on the VPS; raw source
          material stays at its registered origin or in owner-controlled storage.
        </p>
      </header>

      <nav className="page-toc" aria-label="On this page">
        <span>On this page</span>
        <a href="#reactive-flow">Reactive flow</a>
        <a href="#storage-boundaries">Storage boundaries</a>
        <a href="#runtime">Pi runtime</a>
        <a href="#pairing">Pairing</a>
        <a href="#convex-modes">Convex modes</a>
        <a href="#failure-model">Failure model</a>
      </nav>

      <section id="reactive-flow">
        <h2>Reactive flow</h2>
        <p>
          A client submits a command to Convex. Convex creates a queued job. The
          node’s outbound connection sees the job, claims a lease, and reports
          typed progress while the configured runtime works. Convex pushes those
          changes to subscribed clients without a direct client-to-VPS connection.
        </p>
        <ArchitectureFlow />
        <ol className="event-sequence">
          <li><strong>Submit.</strong> A client mutation records one idempotent command.</li>
          <li><strong>Claim.</strong> One eligible node wins a time-bounded lease.</li>
          <li><strong>Run.</strong> The runtime emits normalized lifecycle, tool, and effect events.</li>
          <li><strong>Commit.</strong> Durable writes pass through an effect journal and atomic vault mutation.</li>
          <li><strong>Project.</strong> Compact document metadata is reconciled back to Convex.</li>
          <li><strong>React.</strong> Every subscribed client receives the final state.</li>
        </ol>
      </section>

      <section id="storage-boundaries">
        <h2>Storage boundaries</h2>
        <p>
          Kriyan avoids generic bidirectional sync. A non-authoritative copy must
          be a projection that can be repaired from its named authority.
        </p>
        <div className="wide-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Authority</th>
                <th scope="col">Why it lives there</th>
              </tr>
            </thead>
            <tbody>
              {storageRows.map(([state, authority, reason]) => (
                <tr key={state}>
                  <th scope="row">{state}</th>
                  <td>{authority}</td>
                  <td>{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="notice notice-saffron">
          <strong>Markdown is knowledge authority.</strong>
          <p>
            Convex holds client-facing summaries and provenance. SQLite holds
            lexical and optional vector indexes. Both can be repaired from the
            vault; neither edits the vault as a peer.
          </p>
        </aside>
      </section>

      <section id="runtime">
        <h2>Pi is the runtime boundary</h2>
        <p>
          The node coordinates durable work around Pi; it does not grow a second
          provider registry, tool loop, message format, or compaction system.
          Provider authentication belongs on the VPS through Pi’s own flow.
          Credentials remain in owner-controlled files and never become Convex
          documents. The current source has a deterministic fake runtime for
          integration work; this checkpoint does not claim a live provider session.
        </p>
        <div className="boundary-diagram" role="img" aria-label="Pi runtime boundary">
          <div>
            <span>Kriyan owns</span>
            <strong>Leases · context · tools · effects · projections</strong>
          </div>
          <div className="boundary-core">
            <span>Runtime</span>
            <strong>Pi</strong>
          </div>
          <div>
            <span>Owner chooses</span>
            <strong>Codex or Claude subscription</strong>
          </div>
        </div>
      </section>

      <section id="pairing">
        <h2>Pairing, not central accounts</h2>
        <p>
          The current CLI writes explicit JSON configuration and can create an
          installation record with <code>kriyan pair</code>. Desktop and web clients
          store the Convex URL and installation ID as local, non-secret preferences.
          Node secrets and provider credentials do not belong in client settings.
        </p>
        <p>
          The current cooperative-development boundary is not a finished identity
          or device-authorization system. A future QR or short-lived enrollment
          flow must not be inferred from the existing <code>pair</code> command.
        </p>
        <p>
          This phase intentionally has no central account service. The installation
          ID separates one owner installation’s records from another, but it is not
          an authentication credential. The owner-controlled Convex deployment,
          clients, and VPS are the current self-hosted trust boundary.
        </p>
      </section>

      <section id="convex-modes">
        <h2>One contract, phased deployment proof</h2>
        <div className="mode-comparison">
          <div>
            <h3>Owner’s Convex Cloud project</h3>
            <p>
              The accepted first live-proof path targets a fresh DigitalOcean
              Ubuntu 24.04 x64 host. The node only needs outbound connectivity,
              so Kriyan adds no public application port.
            </p>
          </div>
          <div>
            <h3>Owner’s self-hosted Convex</h3>
            <p>
              A later architecture option for owners who also want to operate the
              coordination plane. It has not passed a deployment gate and is not
              part of the current live plan.
            </p>
          </div>
        </div>
        <p>
          The source is organized around one coordination contract, but source
          compatibility is not provider proof. Convex Cloud with a DigitalOcean
          Ubuntu node is the first verified path. Hetzner and self-hosted Convex
          each require later evidence.
        </p>
      </section>

      <section id="failure-model">
        <h2>Failure is a state, not a disguise</h2>
        <ul>
          <li>If the node is offline, jobs remain queued and clients show node health.</li>
          <li>If a lease expires, a new attempt can recover without repeating a journaled effect.</li>
          <li>If a projection fails, the job remains finalizing until reconciliation repairs it.</li>
          <li>If embeddings are unavailable, lexical search remains functional.</li>
          <li>If a client is offline, an idempotent outbox can submit when it reconnects.</li>
        </ul>
        <p>
          Deterministic tests cover lease, retry, cancellation, durable-effect,
          signal, redaction, vault, and rebuild behavior. The promoted node candidate
          passed Convex Cloud coordination, promotion to the Ubuntu systemd node, and
          a visible local-browser Agent round trip through the deterministic runtime.
          That does not prove iOS, Hetzner, self-hosted Convex, exact packaged-Tauri
          transport, or a real Pi/model-provider session.
        </p>
      </section>
    </article>
  )
}
