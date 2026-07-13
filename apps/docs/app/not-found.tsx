import Link from 'next/link'
import type { JSX } from 'react'

export default function NotFound(): JSX.Element {
  return (
    <main className="state-page" id="main-content">
      <p className="state-code">404 · Unmapped node</p>
      <h1>That path is outside the map.</h1>
      <p>
        The page may have moved, or the link may point to a part of Kriyan that is
        not public yet.
      </p>
      <div className="state-actions">
        <Link className="button button-primary" href="/docs">
          Return to documentation
        </Link>
        <Link className="text-link" href="/">Go home</Link>
      </div>
    </main>
  )
}
