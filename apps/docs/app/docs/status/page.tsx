import type { Metadata } from 'next'
import type { JSX } from 'react'

import { releasePageUrl } from '@/lib/release'

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
          Downloadable artifacts do not imply that this candidate was promoted
          to an existing server or that every provider-backed agent flow passed.
        </p>
      </header>

      <div className="release-matrix" aria-label="V1 release status summary">
        <div data-state="pass"><span>Public release</span><strong>Available</strong><small>Four checksum-linked downloads</small></div>
        <div data-state="pass"><span>VPS service</span><strong>Healthy</strong><small>Prior release restored and active</small></div>
        <div data-state="blocked"><span>VPS promotion</span><strong>Blocked</strong><small>Node capability renegotiation fix pending</small></div>
        <div data-state="partial"><span>Live Agent UI</span><strong>Partial proof</strong><small>Connected; visible completion still pending</small></div>
      </div>

      <aside className="incident-strip" aria-label="Current deployment diagnosis">
        <span>Why promotion failed</span>
        <p>The stable node ID was already registered with legacy capabilities. The backend treated that registration as immutable, so it rejected the candidate&apos;s expanded Agent capabilities. The health gate failed and rollback restored the prior release.</p>
        <strong>Next: deploy capability renegotiation, then promote the node once.</strong>
      </aside>

      <section id="released">
        <h2>V1 release artifacts</h2>
        <p>
          The <a href={releasePageUrl}>v0.1.0 release</a> provides a macOS arm64
          DMG, Android APK, Linux x64 node archive, and Darwin operator CLI with
          integrity metadata. The apps are local/self-hosted; only these docs are hosted.
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
          <li>Live Settings, node preflight, and the `/agents` route passed after the Convex client Strict Mode repair.</li>
        </ul>
      </section>

      <section id="live-reference">
        <h2>Existing DigitalOcean service</h2>
        <p>
          The systemd service is enabled and active, and status, doctor, and restart
          checks are healthy on the prior release. The candidate reached its health
          gate, but its stable node ID was already bound to the legacy capability
          list. Convex rejected the changed registration and the updater rolled back
          correctly. The compatibility fix makes capabilities renegotiable across releases.
        </p>
      </section>

      <section id="boundaries">
        <h2>Boundaries not claimed</h2>
        <ul className="check-list">
          <li>No Apple Developer ID, notarization, App Store, Play Store, iOS, or physical-Android proof.</li>
          <li>No candidate-release promotion or candidate end-to-end desktop-to-VPS round trip.</li>
          <li>No complete visible live Agent chat submission, completion, and event-rendering proof; two browser-control sessions failed in their tooling layer.</li>
          <li>No real Pi/provider session, Hetzner host proof, self-hosted Convex proof, or provider cloud-firewall proof.</li>
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
