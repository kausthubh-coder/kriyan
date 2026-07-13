import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { ConvexClientProvider } from '@/lib/convex'
import { RuntimeSettingsProvider } from '@/lib/runtime-settings'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Today · Kriyan',
  description: 'A grounded control surface for your personal agent',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <RuntimeSettingsProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </RuntimeSettingsProvider>
      </body>
    </html>
  )
}
