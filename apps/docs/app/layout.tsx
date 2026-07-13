import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/hanken-grotesk/wght.css'
import type { Metadata } from 'next'
import type { JSX, ReactNode } from 'react'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { siteUrl } from '@/lib/site'

import './globals.css'

const siteDescription =
  'Kriyan is owner-operated personal software: private apps, your Convex deployment, and an outbound-only agent node on your VPS.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Kriyan — Your work, your infrastructure',
    template: '%s · Kriyan',
  },
  description: siteDescription,
  applicationName: 'Kriyan',
  category: 'technology',
  keywords: [
    'personal agent',
    'second brain',
    'self-hosted',
    'owner-operated software',
    'Convex',
    'Markdown knowledge base',
    'personal productivity',
  ],
  authors: [{ name: 'Kriyan' }],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Kriyan',
    title: 'Kriyan — Your work, your infrastructure',
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kriyan — Your work, your infrastructure',
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="site-shell">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
