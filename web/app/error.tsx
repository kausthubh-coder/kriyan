'use client'

import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <main className="fatal-state"><div className="brand-mark">K</div><h1>Today could not load</h1><p>The live installation returned an unexpected error. Unsaved input on this screen may need to be entered again.</p><button className="primary-button" onClick={reset}>Try loading again</button></main>
}
