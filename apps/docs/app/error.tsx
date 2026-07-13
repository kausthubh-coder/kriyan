'use client'

import Link from 'next/link'
import type { JSX } from 'react'

export default function ErrorPage({ reset }: { reset: () => void }): JSX.Element {
  return (
    <main className="state-page" id="main-content">
      <p className="state-code">Connection interrupted</p>
      <h1>This page did not settle.</h1>
      <p>
        The documentation is static, so a retry should restore the current route.
        No private Kriyan service or owner data is involved.
      </p>
      <div className="state-actions">
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
        <Link className="text-link" href="/docs">Open the docs overview</Link>
      </div>
    </main>
  )
}
