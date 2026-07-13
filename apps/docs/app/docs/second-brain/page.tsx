import type { Metadata } from 'next'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Second brain',
  description: 'Understand Kriyan raw sources, Markdown authority, SQLite indexes, and compact Convex projections.',
  alternates: { canonical: '/docs/second-brain' },
}

const knowledgeCommands = `# Use a private vault path you control.
kriyan source register \\
  --vault <vault-path> \\
  --kind local \\
  --location <source-path> \\
  --name <display-name>

kriyan ingest \\
  --vault <vault-path> \\
  --source-id <source-id> \\
  --entity-kind project \\
  --entity-slug <slug> \\
  --title <title>

kriyan search --vault <vault-path> --query <query> --mode lexical
kriyan index rebuild --vault <vault-path>`

export default function SecondBrainPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Second brain</p>
        <h1>Four layers, one named authority for each.</h1>
        <p>
          Kriyan keeps original material, readable knowledge, search acceleration,
          and client projections separate. That separation makes provenance clear
          and lets derived state be repaired instead of manually reconciled.
        </p>
      </header>

      <section id="layers">
        <h2>The four layers</h2>
        <dl className="definition-list">
          <div><dt>Raw sources</dt><dd>Original bytes or stable references to Git, GitHub, Drive, local, or web material. They establish provenance and do not belong in Convex by default.</dd></div>
          <div><dt>Markdown vault</dt><dd>Authoritative, human-readable source records, transcripts, entities, provenance, and journals on owner-controlled storage.</dd></div>
          <div><dt>SQLite index</dt><dd>A rebuildable lexical index with optional vector support. If embeddings are unavailable, lexical retrieval remains useful.</dd></div>
          <div><dt>Convex projections</dt><dd>Compact source and knowledge summaries for reactive clients. They point back to provenance and never become peer editors of the vault.</dd></div>
        </dl>
      </section>

      <section id="workflow">
        <h2>Register, ingest, retrieve, rebuild</h2>
        <pre className="code-block" aria-label="Knowledge vault command outline"><code>{knowledgeCommands}</code></pre>
        <p>
          The CLI returns structured JSON. Keep source content and real paths out
          of public logs. Hybrid retrieval additionally requires an intentionally
          configured embedding endpoint and model; lexical mode does not.
        </p>
      </section>

      <section id="repair">
        <h2>Repair flows in one direction</h2>
        <ol className="event-sequence">
          <li><strong>Source to Markdown.</strong> Materialization and ingestion write durable knowledge with provenance.</li>
          <li><strong>Markdown to SQLite.</strong> Rebuild recreates the derived search index from the vault.</li>
          <li><strong>Markdown to Convex.</strong> Reconciliation publishes compact client-facing projections.</li>
          <li><strong>Never reverse authority casually.</strong> A stale projection or index is repaired from Markdown, not merged back as truth.</li>
        </ol>
      </section>
    </article>
  )
}
