import type { JSX } from 'react'

export default function Loading(): JSX.Element {
  return (
    <main className="state-page" id="main-content" aria-busy="true">
      <div className="loading-constellation" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>Resolving the map…</p>
      <div className="loading-line long" />
      <div className="loading-line" />
    </main>
  )
}
