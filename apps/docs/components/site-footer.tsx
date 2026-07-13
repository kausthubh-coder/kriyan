import Link from 'next/link'
import type { JSX } from 'react'

export function SiteFooter(): JSX.Element {
  return (
    <footer className="site-footer">
      <div>
        <p className="footer-wordmark">kriyan</p>
        <p>Owner-operated personal software. Integrated source; live release proof pending.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/docs">Docs</Link>
        <Link href="/docs/architecture">Architecture</Link>
        <Link href="/docs/install">Install</Link>
        <Link href="/docs/status">Status</Link>
      </nav>
    </footer>
  )
}
