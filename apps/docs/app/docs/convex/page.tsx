import type { Metadata } from 'next'
import Link from 'next/link'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Fresh Convex setup',
  description: 'Create and verify a fresh owner-controlled Convex Cloud deployment for Kriyan.',
  alternates: { canonical: '/docs/convex' },
}

const setupCommands = `# From the exact Kriyan source checkpoint you intend to deploy
bun install --frozen-lockfile

# Authenticates interactively and creates or selects a development deployment.
bunx convex dev

# In another shell, validate source against the selected development deployment.
bun run codegen:convex
bun run typecheck:convex
bun run typecheck:smoke
bun run test:convex

# Deploy only after reviewing the selected project and production target.
bunx convex deploy`

export default function ConvexPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Fresh Convex setup</p>
        <h1>Create the meeting point from a clean project.</h1>
        <p>
          Convex is Kriyan’s reactive coordination plane and compact projection
          store. It is not the home for raw source files, full transcripts,
          provider credentials, browser profiles, or the local search index.
        </p>
      </header>

      <aside className="notice notice-saffron">
        <strong>Keep deployment details out of public records.</strong>
        <p>
          Store selected deployment names, URLs, and deploy keys only in ignored,
          permission-restricted local configuration. Never paste real values into
          issues, screenshots, build logs, or this documentation.
        </p>
      </aside>

      <section id="create">
        <h2>Create, validate, deploy</h2>
        <ol className="install-steps">
          <li><strong>Start from an exact Git checkpoint.</strong> Confirm the source and generated bindings belong to the revision you intend to operate.</li>
          <li><strong>Create a fresh project.</strong> Use the Convex CLI’s authenticated flow and verify the account, team, and project before accepting.</li>
          <li><strong>Validate against development.</strong> Run code generation, TypeScript checks, and deterministic Convex tests before production.</li>
          <li><strong>Deploy production explicitly.</strong> Read the CLI target confirmation; do not assume a development selection is production.</li>
          <li><strong>Record private runtime configuration.</strong> Give the node and clients the production URL through their local config surfaces.</li>
          <li><strong>Prove and clean a namespaced fixture.</strong> Use a unique installation ID, verify the round trip, then delete only that fixture.</li>
        </ol>
        <pre className="code-block" aria-label="Convex setup commands"><code>{setupCommands}</code></pre>
      </section>

      <section id="authority">
        <h2>What belongs in Convex</h2>
        <div className="mode-comparison">
          <div>
            <h3>Coordination and product state</h3>
            <p>Installations, node presence, commands, jobs, runs and events, tasks, reminders, calendar items, notes, and notification intent.</p>
          </div>
          <div>
            <h3>Compact projections</h3>
            <p>Source references and knowledge summaries that clients need reactively, with provenance IDs back to the VPS authority.</p>
          </div>
        </div>
        <p>
          Raw bytes, full vault documents, SQLite databases, provider sessions,
          and node-local effect journals stay off Convex. This keeps reactive
          clients useful without turning the coordination plane into a second vault.
        </p>
      </section>

      <section id="proof">
        <h2>Fresh-deployment proof</h2>
        <ul className="check-list">
          <li>Codegen and schema/typecheck complete against the chosen development deployment.</li>
          <li>The exact accepted source checkpoint is deployed to the selected production deployment.</li>
          <li>A unique installation is visible to both a client and the VPS node.</li>
          <li>One command produces matching command, job, run, event, and result identities.</li>
          <li>Cleanup is scoped to that deployment and installation, then a second cleanup removes zero rows.</li>
        </ul>
        <p>
          The promoted node candidate passed production Convex coordination with
          the promoted DigitalOcean node and a correlated local-browser Agent run.
          The deterministic runtime returned the visible response and ordered events.
          See the <Link href="/docs/status"> current status</Link> for the exact
          packaged-client, provider, and alternate-host boundaries.
        </p>
      </section>
    </article>
  )
}
