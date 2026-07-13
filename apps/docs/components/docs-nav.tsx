'use client'

import Link from 'next/link'
import type { JSX } from 'react'
import { useRef } from 'react'

const docsNavigation = [
  {
    href: '/docs',
    label: 'Overview',
    description: 'What Kriyan is and is not',
  },
  {
    href: '/docs/architecture',
    label: 'Architecture',
    description: 'Flow, authority, and pairing',
  },
  {
    href: '/docs/install',
    label: 'Install & CLI',
    description: 'Source and standalone paths',
  },
  {
    href: '/docs/convex',
    label: 'Fresh Convex setup',
    description: 'Create the coordination plane',
  },
  {
    href: '/docs/vps',
    label: 'VPS operations',
    description: 'Run and recover the node',
  },
  {
    href: '/docs/desktop',
    label: 'Desktop connection',
    description: 'Connect without sharing secrets',
  },
  {
    href: '/docs/second-brain',
    label: 'Second brain',
    description: 'Sources, Markdown, and search',
  },
  {
    href: '/docs/troubleshooting',
    label: 'Troubleshooting',
    description: 'Diagnose each boundary',
  },
  {
    href: '/docs/updates',
    label: 'Update & rollback',
    description: 'Change releases safely',
  },
  {
    href: '/docs/status',
    label: 'Current status',
    description: 'Implemented versus live-proven',
  },
]

export function DocsNav(): JSX.Element {
  const panelRef = useRef<HTMLDetailsElement>(null)

  function closePanel(): void {
    if (panelRef.current) panelRef.current.open = false
  }

  return (
    <aside className="docs-nav" aria-label="Documentation navigation">
      <details className="docs-nav-panel" ref={panelRef}>
        <summary>Browse documentation</summary>
        <div className="docs-nav-body">
          <p className="docs-nav-title">Documentation</p>
          <nav>
            {docsNavigation.map((item) => (
              <Link href={item.href} key={item.href} onClick={closePanel}>
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Link>
            ))}
          </nav>
          <div className="docs-status">
            <span className="status-light" aria-hidden="true" />
            <div>
              <strong>Source integrated · live proof pending</strong>
              <p>Public binaries and a verified production deployment are not released.</p>
            </div>
          </div>
        </div>
      </details>
    </aside>
  )
}
