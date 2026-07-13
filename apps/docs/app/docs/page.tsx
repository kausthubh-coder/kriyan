import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Understand Kriyan’s reactive architecture, data boundaries, installation paths, operations, and current status.',
  alternates: { canonical: '/docs' },
}

export default function DocsOverviewPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Overview</p>
        <h1>Start with the loop, then the boundaries.</h1>
        <p>
          Kriyan’s apps write intent to your Convex deployment. Your VPS node
          claims that work over an outbound connection, publishes results back to
          Convex, and the apps update reactively. This site explains that system;
          it does not host an owner workspace or receive owner data.
        </p>
      </header>

      <aside className="notice notice-cinnabar" aria-label="Release status">
        <strong>Integrated source; live release proof pending</strong>
        <p>
          The clients, CLI/node, Convex functions, vault/index, and packaging
          scripts exist in source. Public binaries, a production Convex deployment,
          a verified VPS, and a desktop round trip are not claimed here.
        </p>
      </aside>

      <section id="mental-model">
        <h2>The mental model</h2>
        <p>
          Three processes meet through one coordination plane. Your clients
          submit intent and subscribe to changes. Your Convex deployment stores
          compact product state and coordinates work. Your always-on VPS node
          claims jobs, runs the agent, and maintains local knowledge.
        </p>
        <dl className="definition-list">
          <div>
            <dt>Clients</dt>
            <dd>
              Web, desktop, and mobile surfaces. They present state and submit
              commands; they do not run Pi or edit the vault directly.
            </dd>
          </div>
          <div>
            <dt>Convex</dt>
            <dd>
              The owner’s reactive coordination plane for commands, jobs, runs,
              tasks, reminders, automations, devices, and projections.
            </dd>
          </div>
          <div>
            <dt>Agent node</dt>
            <dd>
              An outbound-only service on the owner’s VPS. It leases work, runs
              Pi, journals durable effects, and keeps local knowledge in order.
            </dd>
          </div>
          <div>
            <dt>Vault</dt>
            <dd>
              Source references, cited Markdown, transcripts, and journals on the
              VPS. SQLite indexes are derived and can be rebuilt.
            </dd>
          </div>
        </dl>
      </section>

      <section id="principles">
        <h2>Five rules keep it honest</h2>
        <ol className="principle-list">
          <li>
            <strong>One authority for each kind of state.</strong>
            No generic two-way sync between Convex and Markdown.
          </li>
          <li>
            <strong>Raw material stays traceable.</strong>
            Derived facts link to transcripts, which link to a captured artifact
            or a pinned external revision.
          </li>
          <li>
            <strong>The node, not the browser, executes.</strong>
            Subscription CLIs and provider credentials remain on the owner’s VPS.
          </li>
          <li>
            <strong>Reactive does not mean centralized.</strong>
            The contract supports an owner-controlled Cloud project or a
            self-hosted deployment. The first release path uses Convex Cloud;
            self-hosted proof is a later gate.
          </li>
          <li>
            <strong>Distribution claims follow evidence.</strong>
            Implemented source is not presented as a public download or live service.
          </li>
        </ol>
      </section>

      <section id="choose-next">
        <h2>Choose the next document</h2>
        <div className="next-links">
          <Link href="/docs/architecture">
            <span>Architecture</span>
            Follow a command from client to cited knowledge.
          </Link>
          <Link href="/docs/install">
            <span>Install & standalone CLI</span>
            Separate the source workflow from the pending public artifact path.
          </Link>
          <Link href="/docs/status">
            <span>Current status</span>
            See what is implemented, locally verified, and still unproven.
          </Link>
        </div>
      </section>
    </article>
  )
}
