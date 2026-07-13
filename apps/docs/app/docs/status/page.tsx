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
          This page describes the baseline used to build these docs on July 13,
          2026. It deliberately does not anticipate results from the separate
          CLI artifact, cloud integration, VPS, desktop, or docs deployment lanes.
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
        <h2>Locally verified on the baseline</h2>
        <p>
          The recorded integration contract reports a frozen install, TypeScript
          checks across the product, 147 unique deterministic tests, web and mobile
          lint, Next.js production and desktop exports, an Android JS export, Rust
          checks, and a debug Tauri app build. Demo-mode browser and desktop
          interaction were also exercised with explicit limitations.
        </p>
        <p>
          Those results prove the recorded local checkout and deterministic
          fixtures. They do not prove a public download, production deployment,
          Linux host, physical mobile device, or real provider session.
        </p>
      </section>

      <section id="pending">
        <h2>Not claimed by this checkpoint</h2>
        <ul className="check-list">
          <li>No fresh production Convex Cloud deployment or live two-client cloud proof.</li>
          <li>No public standalone CLI/node release, checksum URL, signing, or clean-Ubuntu install proof.</li>
          <li>No running DigitalOcean or Hetzner Kriyan node, host reboot proof, or provider support claim.</li>
          <li>No real Tauri desktop → Convex → VPS → Convex → desktop round trip.</li>
          <li>No real Codex or Claude provider session through Pi.</li>
          <li>No production deployment claim for this documentation site.</li>
          <li>No iOS runtime proof, Android emulator/physical-device proof, or self-hosted Convex proof.</li>
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
