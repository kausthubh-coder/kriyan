import type { JSX, ReactNode } from 'react'

import { DocsNav } from '@/components/docs-nav'

export default function DocsLayout({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <main className="docs-shell" id="main-content">
      <DocsNav />
      <div className="docs-content">{children}</div>
    </main>
  )
}
