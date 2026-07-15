import type { Metadata } from 'next'
import type { JSX } from 'react'

import { appReleasePageUrl, nodeReleasePageUrl } from '@/lib/release'

export const metadata: Metadata = {
  title: 'Current status',
  description: 'The honest Kriyan boundary between implemented source, packaged V1 artifacts, live deployment, and unproven flows.',
  alternates: { canonical: '/docs/status' },
}

export default function StatusPage(): JSX.Element {
  return (
    <article className="prose docs-article">
      <header className="docs-hero">
        <p className="doc-path">Docs / Current status</p>
        <h1>Packaged, locally verified, live-proven, and promoted are different states.</h1>
        <p>
          This page describes the V1 release boundary as of July 15, 2026.
          The exact node candidate is promoted to the reference server and
          its deterministic Agent path passed. Provider-backed agent work is a separate boundary.
        </p>
      </header>

      <div className="release-matrix" aria-label="V1 release status summary">
        <div data-state="pass"><span>Public release</span><strong>Available</strong><small>Four checksum-linked downloads</small></div>
        <div data-state="pass"><span>VPS service</span><strong>Healthy</strong><small>Exact candidate active with a fresh heartbeat</small></div>
        <div data-state="pass"><span>VPS promotion</span><strong>Passed</strong><small>Identity and process-health gates passed</small></div>
        <div data-state="pass"><span>Live Agent UI</span><strong>Passed</strong><small>Deterministic runtime completed the visible flow</small></div>
      </div>

      <aside className="incident-strip" aria-label="Resolved deployment incident">
        <span>Resolved upgrade incident</span>
        <p>The stable node ID was registered with legacy capabilities. The old backend rejected the candidate&apos;s expanded Agent capabilities, and rollback correctly restored the prior release. Capability renegotiation was added before the exact candidate was rebuilt and promoted.</p>
        <strong>The later promotion passed; arbitrary remote stderr remains private.</strong>
      </aside>

      <section id="released">
        <h2>V1 release artifacts</h2>
        <p>
          The <a href={appReleasePageUrl}>v0.1.0 app release</a> provides the macOS arm64
          DMG and Android APK. The <a href={nodeReleasePageUrl}>v0.1.1 tooling patch</a> provides
          the exact Linux x64 node archive and Darwin operator CLI used by the promoted
          reference node, with integrity metadata. The apps are local/self-hosted; only these docs are hosted.
        </p>
        <ul className="check-list">
          <li>The macOS app is ad-hoc signed, strictly sealed, Apple-silicon only, and not notarized.</li>
          <li>The Android APK is debug-signed for direct installation, not Play Store distribution.</li>
          <li>The Linux archive contains standalone CLI/node executables; Bun is not required on the Ubuntu host.</li>
          <li>The Darwin operator is a single-file CLI for setup and SSH-based VPS lifecycle operations.</li>
        </ul>
      </section>

      <section id="implemented">
        <h2>Implemented in the integrated source</h2>
        <ul className="check-list">
          <li>Next.js web, Expo Android, and Tauri macOS clients over shared product contracts.</li>
          <li>Tasks, reminders, calendar, notes, source/knowledge views, and local persistence.</li>
          <li>Convex coordination for product state, node presence, commands/jobs/runs, and agent workspaces.</li>
          <li>A Bun node/CLI with pairing, health, work submission, lease/retry/recovery, source ingestion, search, and indexing.</li>
          <li>An owner-controlled Markdown/SQLite vault with citations, provenance, and rebuildable indexes.</li>
        </ul>
      </section>

      <section id="verified">
        <h2>Component verification</h2>
        <ul className="check-list">
          <li>The Android APK installed on an API 36 emulator and preserved task/note changes through force-stop and cold launch.</li>
          <li>The desktop DMG contains a strictly verified copied app; the prior visible desktop flow covered tasks, notes, navigation, and relaunch persistence.</li>
          <li>Standalone CLI/node/operator artifacts passed local identity and archive verification.</li>
          <li>Live Settings and `/agents` completed a browser → Convex → DigitalOcean node → Convex → browser round trip with an assistant response and four ordered events.</li>
        </ul>
      </section>

      <section id="live-reference">
        <h2>Existing DigitalOcean service</h2>
        <p>
          The systemd service is enabled and active on the exact promoted node build.
          Status and doctor report the expected release, current process health, and
          a fresh heartbeat. The browser-visible deterministic Agent run also completed
          through this node after capability renegotiation was deployed.
        </p>
      </section>

      <section id="boundaries">
        <h2>Boundaries not claimed</h2>
        <ul className="check-list">
          <li>No Apple Developer ID, notarization, App Store, Play Store, iOS, or physical-Android proof.</li>
          <li>No exact packaged-Tauri-to-VPS Agent proof; the current full Agent proof used the local browser client.</li>
          <li>No real Pi/model-provider session, provider-backed tool run, Hetzner host proof, self-hosted Convex proof, or provider cloud-firewall proof.</li>
          <li>No multi-process fence for two workers sharing one stable node ID; V1 operates one systemd process per node identity.</li>
          <li>No hosted product workspace; the public production surface is documentation only.</li>
        </ul>
      </section>

      <section id="release-language">
        <h2>Release language</h2>
        <dl className="definition-list">
          <div><dt>Implemented</dt><dd>The behavior exists in source.</dd></div>
          <div><dt>Locally verified</dt><dd>The exact checkpoint or artifact passed named local checks.</dd></div>
          <div><dt>Released</dt><dd>A versioned artifact is publicly available with integrity metadata and installation guidance.</dd></div>
          <div><dt>Promoted</dt><dd>The exact candidate is running on a named owner-controlled deployment or host and passed its post-promotion gate.</dd></div>
        </dl>
      </section>
    </article>
  )
}
