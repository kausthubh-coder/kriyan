import type { Metadata } from 'next'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Current status',
  description: 'The honest Kriyan boundary between implemented source, local verification, live deployment, and public release.',
  alternates: { canonical: '/docs/status' },
}

export default function StatusPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Current status</p>
        <h1>Implemented, locally verified, live-proven, and released are different states.</h1>
        <p>
          This page describes the verified reference deployment as of July 13,
          2026. It separates that exact live path from public distribution,
          mobile platforms, alternative providers, and provider-runtime claims.
        </p>
      </header>

      <section id="implemented">
        <h2>Implemented in the integrated source</h2>
        <ul className="check-list">
          <li>Next.js web, Expo mobile, and Tauri macOS clients over shared product contracts.</li>
          <li>Convex functions for coordination, product state, node presence, and compact knowledge projections.</li>
          <li>A Bun CLI and long-running node with setup, pairing, status, doctor, submission, retry, lease, and recovery behavior.</li>
          <li>An owner-controlled knowledge vault with sources, Markdown, provenance, journals, SQLite lexical retrieval, optional embeddings, and rebuild.</li>
          <li>Linux x64 standalone build, provenance, archive, install, update, rollback, backup, restore, systemd, and health scripts.</li>
        </ul>
      </section>

      <section id="verified">
        <h2>Locally verified on the exact source</h2>
        <p>
          The recorded integration contract reports a frozen install, TypeScript
          checks and deterministic tests across the product, web and mobile lint,
          Next.js production and desktop exports, an Android JS export, Rust
          checks, exact standalone release verification, and a debug Tauri app build.
        </p>
        <p>
          Those checks prove the named source and artifacts. Live-provider and host
          claims additionally require the correlated evidence below; neither layer
          proves a physical mobile device or a real Pi provider session.
        </p>
      </section>

      <section id="live-reference">
        <h2>Live reference deployment verified</h2>
        <ul className="check-list">
          <li>A fresh owner-controlled Convex Cloud production deployment runs the exact accepted source.</li>
          <li>A standalone Linux x64 node runs on Ubuntu 24.04 without Bun installed on the host.</li>
          <li>The systemd service is enabled and active, and recovered after service restart and host reboot with a new process heartbeat.</li>
          <li>An exact-release Tauri desktop command completed through production Convex and the Ubuntu VPS, created a reminder, and returned it to the desktop.</li>
          <li>The public documentation is deployed at its canonical production origin with indexable metadata.</li>
        </ul>
      </section>

      <section id="boundaries">
        <h2>Boundaries not claimed</h2>
        <ul className="check-list">
          <li>No general public standalone CLI/node download, checksum URL, signed release, or notarized desktop distribution.</li>
          <li>No real Codex or Claude provider session through Pi.</li>
          <li>No iOS runtime proof, Android emulator/physical-device proof, or self-hosted Convex proof.</li>
          <li>No Hetzner host proof or verified DigitalOcean Cloud Firewall resource; Kriyan opened no inbound application port and did not weaken SSH policy.</li>
          <li>No deployed live web workspace or two-session production web reactivity proof; the public production site is documentation only.</li>
        </ul>
      </section>

      <section id="release-language">
        <h2>Release language</h2>
        <dl className="definition-list">
          <div><dt>Implemented</dt><dd>The behavior exists in source.</dd></div>
          <div><dt>Locally verified</dt><dd>The exact checkpoint passed named local checks and fixtures.</dd></div>
          <div><dt>Live-proven</dt><dd>The exact checkpoint passed a named real-service and host flow with sanitized evidence.</dd></div>
          <div><dt>Released</dt><dd>A versioned artifact is publicly available with integrity metadata and installation guidance.</dd></div>
          <div><dt>Shipped</dt><dd>The requested production promotion occurred and was independently verified.</dd></div>
        </dl>
      </section>
    </article>
  )
}
