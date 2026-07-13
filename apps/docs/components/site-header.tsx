'use client'

import Link from 'next/link'
import type { JSX } from 'react'
import { useRef } from 'react'

const navigation = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs/architecture', label: 'Architecture' },
  { href: '/docs/install', label: 'Install' },
  { href: '/docs/status', label: 'Status' },
]

function BrandMark(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 32 32"
    >
      <path d="M7 22 13 9l6 7 6-9" />
      <circle cx="7" cy="22" r="2.5" />
      <circle cx="13" cy="9" r="2.5" />
      <circle cx="19" cy="16" r="2.5" />
      <circle cx="25" cy="7" r="2.5" />
    </svg>
  )
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  return (
    <>
      {navigation.map((item) => (
        <Link href={item.href} key={item.href} onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
    </>
  )
}

export function SiteHeader(): JSX.Element {
  const mobileMenuRef = useRef<HTMLDetailsElement>(null)

  function closeMobileMenu(): void {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand-link" href="/" aria-label="Kriyan home">
          <BrandMark />
          <span>kriyan</span>
        </Link>

        <nav aria-label="Primary navigation" className="desktop-nav">
          <NavigationLinks />
        </nav>

        <details className="mobile-nav" ref={mobileMenuRef}>
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            <NavigationLinks onNavigate={closeMobileMenu} />
          </nav>
        </details>
      </div>
    </header>
  )
}
