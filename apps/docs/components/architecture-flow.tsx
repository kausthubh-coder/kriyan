import type { JSX } from 'react'

const flow = [
  {
    name: 'App sends intent',
    detail: 'Desktop, web, or mobile writes a command to your deployment.',
    meta: '1 · app',
  },
  {
    name: 'Convex coordinates',
    detail: 'The coordination plane creates a job and exposes it reactively.',
    meta: '2 · convex',
  },
  {
    name: 'VPS executes',
    detail: 'The outbound-only node claims a lease, runs tools, and records events.',
    meta: '3 · vps',
  },
  {
    name: 'Convex projects',
    detail: 'Typed run state and compact results return to the coordination plane.',
    meta: '4 · convex',
  },
  {
    name: 'App reacts',
    detail: 'Subscriptions update every connected client without direct VPS access.',
    meta: '5 · app',
  },
]

export function ArchitectureFlow(): JSX.Element {
  return (
    <figure className="architecture-flow">
      <ol>
        {flow.map((item) => (
          <li key={item.name}>
            <span className="flow-dot" aria-hidden="true" />
            <p className="flow-meta">{item.meta}</p>
            <h3>{item.name}</h3>
            <p>{item.detail}</p>
          </li>
        ))}
      </ol>
      <figcaption>
        App → Convex → VPS → Convex → app. Convex carries coordination and
        compact projections; source references, Markdown, and indexes stay on the
        node while original material remains in owner-controlled storage.
      </figcaption>
    </figure>
  )
}
