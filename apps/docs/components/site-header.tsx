'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}): JSX.Element {
  return (
    <>
      {navigation.map((item) => (
        <Link
          aria-current={pathname === item.href ? 'page' : undefined}
          href={item.href}
          key={item.href}
          onClick={onNavigate}
        >
          {item.label}
          {pathname === item.href && (
            <span aria-hidden="true" className="current-route-label">Current</span>
          )}
        </Link>
      ))}
    </>
  )
}

export function SiteHeader(): JSX.Element {
  const mobileMenuRef = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  function closeMobileMenu(): void {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link
          aria-current={pathname === '/' ? 'page' : undefined}
          aria-label="Kriyan home"
          className="brand-link"
          href="/"
        >
          <BrandMark />
          <span>kriyan</span>
          {pathname === '/' && (
            <span aria-hidden="true" className="current-route-label">Current</span>
          )}
        </Link>

        <nav aria-label="Primary navigation" className="desktop-nav">
          <NavigationLinks pathname={pathname} />
        </nav>

        <details className="mobile-nav" ref={mobileMenuRef}>
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            <NavigationLinks pathname={pathname} onNavigate={closeMobileMenu} />
          </nav>
        </details>
      </div>
    </header>
  )
}
