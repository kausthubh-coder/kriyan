'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import {
  ActivityIcon,
  BellIcon,
  CalendarIcon,
  EntityIcon,
  NoteIcon,
  SettingsIcon,
  SourceIcon,
  TaskIcon,
  TodayIcon,
} from '@/components/today/icons'

export const PRODUCT_NAV_ITEMS = [
  { label: 'Today', href: '/today', icon: TodayIcon },
  { label: 'Tasks', href: '/tasks', icon: TaskIcon },
  { label: 'Calendar', href: '/calendar', icon: CalendarIcon },
  { label: 'Reminders', href: '/reminders', icon: BellIcon },
  { label: 'Notes', href: '/notes', icon: NoteIcon },
  { label: 'Sources', href: '/sources', icon: SourceIcon },
  { label: 'Artifacts', href: '/artifacts', icon: NoteIcon },
  { label: 'Memory', href: '/memory', icon: EntityIcon },
  { label: 'Agents', href: '/agents', icon: ActivityIcon },
  { label: 'Settings', href: '/settings', icon: SettingsIcon },
] as const

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ProductNavigation({ className }: { className: string }): ReactNode {
  const pathname = usePathname()

  return (
    <nav className={className} aria-label="Primary navigation">
      {PRODUCT_NAV_ITEMS.map((item) => {
        const active = isActiveRoute(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function ProductRouteFrame({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="app-shell route-shell">
      <aside className="side-rail" aria-label="Kriyan workspace">
        <Link href="/today" className="brand">
          <span className="brand-mark">K</span>
          <span className="brand-copy">
            <strong>Kriyan</strong>
            <span>Personal workspace</span>
          </span>
        </Link>
        <ProductNavigation className="primary-nav" />
        <div className="route-boundary">
          <span className="status-dot online" />
          <span>Convex state plane</span>
        </div>
      </aside>

      <header className="mobile-header">
        <Link href="/today" className="brand brand-compact">
          <span className="brand-mark">K</span>
          <span className="brand-copy"><strong>Kriyan</strong></span>
        </Link>
        <span className="route-mobile-label">Personal workspace</span>
      </header>

      <div className="route-content">{children}</div>
      <ProductNavigation className="mobile-nav" />
    </div>
  )
}
