import type { JSX } from 'react'

export function KnowledgeConstellation(): JSX.Element {
  return (
    <figure className="constellation" aria-labelledby="constellation-caption">
      <svg
        aria-hidden="true"
        className="constellation-map"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 720 600"
      >
        <g className="constellation-lines">
          <path d="M95 154 224 95 356 171 486 103 619 172" />
          <path d="M95 154 173 298 336 274 356 171" />
          <path d="M173 298 282 424 446 373 336 274" />
          <path d="M446 373 565 289 619 172" />
          <path d="M282 424 407 509 557 456 446 373" />
          <path d="M224 95 336 274 486 103" />
        </g>
        <g className="constellation-nodes constellation-drift-slow">
          <circle cx="95" cy="154" r="7" />
          <circle cx="224" cy="95" r="10" />
          <circle className="node-primary" cx="356" cy="171" r="14" />
          <circle cx="486" cy="103" r="8" />
          <circle cx="619" cy="172" r="11" />
          <circle cx="173" cy="298" r="9" />
          <circle cx="336" cy="274" r="7" />
          <circle cx="565" cy="289" r="8" />
          <circle cx="282" cy="424" r="10" />
          <circle className="node-primary" cx="446" cy="373" r="12" />
          <circle cx="407" cy="509" r="7" />
          <circle cx="557" cy="456" r="9" />
        </g>
        <g className="constellation-labels">
          <text x="72" y="135">source</text>
          <text x="326" y="137">Korean</text>
          <text x="590" y="142">person</text>
          <text x="134" y="332">decision</text>
          <text x="411" y="411">project</text>
          <text x="525" y="492">task</text>
        </g>
      </svg>
      <figcaption id="constellation-caption">
        Raw sources remain connected to the people, projects, decisions, and
        actions derived from them.
      </figcaption>
    </figure>
  )
}
