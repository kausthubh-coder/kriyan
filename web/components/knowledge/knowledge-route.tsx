'use client'

import {
  formatRelativeTime,
  type ArtifactItem,
  type ConnectionMode,
  type KnowledgeDocumentItem,
  type MemoryEntityDetailItem,
  type ProductMutationResult,
  type SourceDetailItem,
} from '@kriyan/client-core'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useConvexClientControls } from '@/lib/convex'
import {
  useRuntimeSettings,
  type KriyanWebConfiguration,
} from '@/lib/runtime-settings'
import { useDemoRepository } from '@/src/client-core/demo-repository'
import { useLiveWebRepository } from '@/src/client-core/live-web-repository'
import type { WebRepository } from '@/src/client-core/web-repository'
import styles from '@/components/productivity/productivity.module.css'

import { restoreDemoKnowledge } from './demo-knowledge-persistence'

export type KnowledgeRouteView =
  | { kind: 'today' }
  | { kind: 'artifacts' }
  | { kind: 'artifact'; id: string }
  | { kind: 'memory' }
  | { kind: 'entity'; id: string }
  | { kind: 'source'; id: string }

type Notice = { tone: 'success' | 'error'; text: string }

function tone(
  value: string,
): 'success' | 'warning' | 'danger' | 'active' | 'neutral' {
  if (['synced', 'indexed', 'projected', 'applied', 'restored'].includes(value))
    return 'success'
  if (['pending', 'stale', 'tombstoned'].includes(value)) return 'warning'
  if (['failed', 'conflict'].includes(value)) return 'danger'
  if (['person', 'project', 'topic', 'organization'].includes(value))
    return 'active'
  return 'neutral'
}

function Status({ children }: { children: string }) {
  return (
    <span className={styles.status} data-tone={tone(children)}>
      {children.replaceAll('-', ' ')}
    </span>
  )
}

function historicalTimestamp(value: number): string {
  return Number.isFinite(value) && value >= Date.UTC(2000, 0, 1)
    ? new Date(value).toLocaleString()
    : 'Timestamp unavailable'
}

function Loading({ label = 'Loading current data' }: { label?: string }) {
  return (
    <div className={styles.loading} aria-label={label} aria-busy="true">
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function ErrorState({
  message,
  retry,
}: {
  message: string
  retry: () => void
}) {
  return (
    <div className={styles.error} role="alert">
      <strong>That view could not be loaded.</strong>
      <p>{message}</p>
      <div>
        <button className={styles.quietButton} onClick={retry}>
          Try again
        </button>
      </div>
    </div>
  )
}

function resultNotice(
  result: ProductMutationResult<unknown>,
  success: string,
): Notice {
  return result.ok
    ? { tone: 'success', text: success }
    : { tone: 'error', text: result.message }
}

export function KnowledgeRoute({ view }: { view: KnowledgeRouteView }) {
  const { settings } = useRuntimeSettings()
  return settings.demoMode ? (
    <DemoKnowledgeRoute view={view} />
  ) : (
    <LiveKnowledgeRoute view={view} configuration={settings} />
  )
}

function DemoKnowledgeRoute({ view }: { view: KnowledgeRouteView }) {
  const repository = useDemoRepository(null)
  const [restored, setRestored] = useState(false)
  const restorePromise = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (repository.loading) return
    restorePromise.current ??= restoreDemoKnowledge(repository)
    void restorePromise.current.finally(() => setRestored(true))
    // Restore the browser-only demo after its deterministic seed is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository.loading])

  if (!restored) {
    return (
      <main className={styles.page}>
        <Loading label="Restoring demo knowledge" />
      </main>
    )
  }
  return (
    <RouteSurface
      view={view}
      repository={repository}
      connection="offline"
      demoMode
    />
  )
}

function LiveKnowledgeRoute({
  view,
  configuration,
}: {
  view: KnowledgeRouteView
  configuration: KriyanWebConfiguration
}) {
  const controls = useConvexClientControls()
  const runtime = useLiveWebRepository(configuration, null, controls.generation)
  return (
    <RouteSurface
      view={view}
      repository={runtime.repository}
      connection={runtime.connectionMode}
      demoMode={false}
    />
  )
}

function RouteSurface({
  view,
  repository,
  connection,
  demoMode,
}: {
  view: KnowledgeRouteView
  repository: WebRepository
  connection: ConnectionMode
  demoMode: boolean
}) {
  const copy =
    view.kind === 'today'
      ? [
          'Today',
          'What needs attention, what changed, and what is ready to continue.',
        ]
      : view.kind === 'artifacts'
        ? [
            'Artifacts',
            'Read-only Markdown projections of committed note versions.',
          ]
        : view.kind === 'memory'
          ? [
              'Memory',
              'Derived people, projects, and topics with traceable evidence.',
            ]
          : view.kind === 'source'
            ? [
                'Source detail',
                'The original location, extracted evidence, and every derived change.',
              ]
            : view.kind === 'artifact'
              ? [
                  'Artifact detail',
                  'Projection history for one committed authored output.',
                ]
              : [
                  'Entity detail',
                  'Facts, relations, provenance, corrections, and conflicts.',
                ]

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          {view.kind !== 'today' && (
            <Link
              className={styles.backLink}
              href={
                view.kind === 'source'
                  ? '/sources'
                  : view.kind === 'entity'
                    ? '/memory'
                    : '/artifacts'
              }
            >
              ← Back
            </Link>
          )}
          <h1>{copy[0]}</h1>
          <p>{copy[1]}</p>
        </div>
        <span
          className={styles.connection}
          data-mode={connection}
          role="status"
        >
          {demoMode ? 'offline demo' : connection}
        </span>
      </header>
      {view.kind === 'today' && <TodayKnowledge repository={repository} />}
      {view.kind === 'artifacts' && <ArtifactList repository={repository} />}
      {view.kind === 'artifact' && (
        <ArtifactDetail repository={repository} artifactId={view.id} />
      )}
      {view.kind === 'memory' && <MemoryList repository={repository} />}
      {view.kind === 'entity' && (
        <EntityDetail repository={repository} entityId={view.id} />
      )}
      {view.kind === 'source' && (
        <SourceDetail repository={repository} sourceRefId={view.id} />
      )}
    </main>
  )
}

function TodayKnowledge({ repository }: { repository: WebRepository }) {
  const [now] = useState(() => Date.now())
  const openTasks = repository.tasks.filter((item) => item.status === 'open')
  const urgent = openTasks.filter(
    (item) =>
      item.priority === 'urgent' ||
      (item.dueAt !== undefined && item.dueAt < now),
  )
  const agenda = repository.calendarEvents
    .filter((item) => item.lifecycle !== 'cancelled' && item.endAt >= now)
    .slice(0, 4)
  const reminders = repository.reminders
    .filter((item) => ['scheduled', 'fired'].includes(item.status))
    .slice(0, 4)
  const sources = [...repository.sourceRefs]
    .sort(
      (left, right) =>
        (right.lastSyncedAt ?? right.updatedAt) -
        (left.lastSyncedAt ?? left.updatedAt),
    )
    .slice(0, 4)
  const memory = [...repository.knowledgeDocuments]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 4)

  if (repository.loading) return <Loading />
  return (
    <>
      <section className={styles.ruledSection}>
        <div className={styles.sectionHeader}>
          <h2>Needs you</h2>
          <span>{urgent.length} important</span>
        </div>
        {urgent.length === 0 ? (
          <Empty
            title="Nothing is overdue"
            body="Important and overdue work will stay at the top of Today."
          />
        ) : (
          <div className={styles.list}>
            {urgent.slice(0, 5).map((task) => (
              <div className={styles.row} key={task.taskId}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    <strong>{task.title}</strong>
                    <Status>{task.priority ?? 'normal'}</Status>
                  </div>
                  <div className={styles.metadata}>
                    {task.dueAt && (
                      <span>{formatRelativeTime(task.dueAt, now)}</span>
                    )}
                    {task.projectId && <span>{task.projectId}</span>}
                  </div>
                </div>
                <Link className={styles.textLink} href="/tasks">
                  Open task
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h2>Agenda</h2>
              <span>{agenda.length} upcoming</span>
            </div>
            {agenda.length === 0 ? (
              <Empty
                title="The next stretch is open"
                body="Calendar events appear here without requiring the agent node."
              />
            ) : (
              <div className={styles.list}>
                {agenda.map((event) => (
                  <div className={styles.row} key={event.calendarEventId}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>
                        <strong>{event.title}</strong>
                        <Status>{event.lifecycle}</Status>
                      </div>
                      <div className={styles.metadata}>
                        <span>{new Date(event.startAt).toLocaleString()}</span>
                        {event.location && <span>{event.location}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h2>Recent captures</h2>
              <Link className={styles.textLink} href="/sources">
                All sources
              </Link>
            </div>
            {sources.length === 0 ? (
              <Empty
                title="No captures yet"
                body="Registered sources keep their original location and show exactly what Kriyan retained."
              />
            ) : (
              <div className={styles.list}>
                {sources.map((source) => (
                  <div className={styles.row} key={source.sourceRefId}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>
                        <strong>{source.displayName}</strong>
                        <Status>{source.kind}</Status>
                      </div>
                      <div className={styles.metadata}>
                        <Status>{source.syncState}</Status>
                        <Status>{source.indexState}</Status>
                      </div>
                    </div>
                    <Link
                      className={styles.textLink}
                      href={`/sources/${encodeURIComponent(source.sourceRefId)}`}
                    >
                      Inspect
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className={styles.detailAside}>
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h2>Reminders</h2>
              <Link className={styles.textLink} href="/reminders">
                Manage
              </Link>
            </div>
            {reminders.length === 0 ? (
              <Empty
                title="Nothing is scheduled"
                body="Persistent and critical reminders stay explicit about their delivery policy."
              />
            ) : (
              <div className={styles.list}>
                {reminders.map((reminder) => (
                  <div className={styles.row} key={reminder.reminderId}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>
                        <strong>{reminder.message}</strong>
                        <Status>{reminder.deliveryPolicy ?? 'normal'}</Status>
                      </div>
                      <div className={styles.metadata}>
                        <span>
                          {formatRelativeTime(
                            reminder.nextFireAt ?? reminder.remindAt,
                            now,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h2>Memory changes</h2>
              <Link className={styles.textLink} href="/memory">
                Open Memory
              </Link>
            </div>
            {memory.length === 0 ? (
              <Empty
                title="Memory is waiting for evidence"
                body="Derived entities appear only after a cited source or artifact is processed."
              />
            ) : (
              <div className={styles.list}>
                {memory.map((item) => (
                  <div className={styles.row} key={item.knowledgeDocumentId}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>
                        <strong>{item.title}</strong>
                        <Status>{item.kind}</Status>
                      </div>
                      <p>{item.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h2>Active agent handoff</h2>
              <span>{repository.activity.length} recent</span>
            </div>
            <div className={styles.honesty}>
              <strong>
                {repository.nodes.length > 0
                  ? 'Node registered.'
                  : 'No node paired.'}
              </strong>
              <span>
                Agent runs are separate from productivity records. Completed
                work surfaces here only as a task, reminder, event, note, or
                cited Memory update.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}

function ArtifactList({ repository }: { repository: WebRepository }) {
  const [artifacts, setArtifacts] = useState<ArtifactItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const noteKey = repository.notes
    .map((note) => `${note.noteId}:${note.revision}`)
    .join('|')

  useEffect(() => {
    let active = true
    void Promise.all(
      repository.notes.map((note) =>
        repository.artifactsV1.listByNote(note.noteId, true),
      ),
    )
      .then((pages) => {
        if (active)
          setArtifacts(
            pages
              .flat()
              .sort((left, right) => right.updatedAt - left.updatedAt),
          )
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Artifact history could not be read.',
          )
      })
    return () => {
      active = false
    }
    // The repository adapter is intentionally read through its accepted detail port.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, refresh])

  if (repository.loading || artifacts === null)
    return <Loading label="Loading artifact projections" />
  if (error)
    return (
      <ErrorState
        message={error}
        retry={() => {
          setError(null)
          setArtifacts(null)
          setRefresh((value) => value + 1)
        }}
      />
    )
  return (
    <section className={styles.ruledSection}>
      <div className={styles.sectionHeader}>
        <h2>Authored outputs</h2>
        <span>{artifacts.length} including tombstones</span>
      </div>
      <div className={styles.honesty}>
        <strong>One editable authority.</strong>
        <span>
          Artifacts are read-only projections of committed note versions. Edit
          the note, commit a new version, then advance the artifact.
        </span>
      </div>
      {artifacts.length === 0 ? (
        <Empty
          title="No artifacts yet"
          body="Open a note, save a version, and create an artifact projection from that committed version."
        />
      ) : (
        <div className={styles.list}>
          {artifacts.map((artifact) => (
            <article className={styles.row} key={artifact.artifactId}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  <strong>{artifact.slug}.md</strong>
                  <Status>{artifact.projectionState}</Status>
                </div>
                <div className={styles.metadata}>
                  <span>note {artifact.noteId}</span>
                  <span>revision {artifact.revision}</span>
                  {artifact.projectedHash && (
                    <span className={styles.hash}>
                      {artifact.projectedHash.slice(0, 12)}
                    </span>
                  )}
                </div>
                {artifact.lastError && <p>{artifact.lastError}</p>}
              </div>
              <Link
                className={styles.textLink}
                href={`/artifacts/${encodeURIComponent(artifact.artifactId)}`}
              >
                Inspect history
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ArtifactDetail({
  repository,
  artifactId,
}: {
  repository: WebRepository
  artifactId: string
}) {
  const [artifact, setArtifact] = useState<ArtifactItem | null | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [slug, setSlug] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    void repository.artifactsV1
      .get(artifactId)
      .then((value) => {
        if (!active) return
        setArtifact(value)
        setSlug(value?.slug ?? '')
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Artifact could not be read.',
          )
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactId, refresh])

  if (artifact === undefined) return <Loading label="Loading artifact detail" />
  if (error)
    return (
      <ErrorState
        message={error}
        retry={() => {
          setError(null)
          setArtifact(undefined)
          setRefresh((value) => value + 1)
        }}
      />
    )
  if (artifact === null)
    return (
      <Empty
        title="Artifact not found"
        body="This artifact may have been removed from the installation."
      />
    )
  const busy = false
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailMain}>
        {notice && (
          <div className={styles.notice} data-tone={notice.tone}>
            {notice.text}
          </div>
        )}
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>{artifact.slug}.md</h2>
            <Status>{artifact.projectionState}</Status>
          </div>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Committed note version</dt>
              <dd>{artifact.noteVersionId}</dd>
              <span>rev {artifact.revision}</span>
            </div>
            <div className={styles.fact}>
              <dt>Projected path</dt>
              <dd className={styles.hash}>
                {artifact.projectedPath ??
                  'Waiting for the node to materialize'}
              </dd>
              <span />
            </div>
            <div className={styles.fact}>
              <dt>Current hash</dt>
              <dd className={styles.hash}>
                {artifact.projectedHash ?? 'Not projected yet'}
              </dd>
              <span />
            </div>
            <div className={styles.fact}>
              <dt>Prior projection</dt>
              <dd className={styles.hash}>
                {artifact.priorProjectedPath ?? 'None'}
              </dd>
              <span />
            </div>
          </dl>
        </section>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>Projection history</h2>
            <span>{artifact.history?.length ?? 0} transitions</span>
          </div>
          <div className={styles.list}>
            {artifact.history?.map((entry) => (
              <div
                className={styles.row}
                key={`${entry.revision}:${entry.occurredAt}`}
              >
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    <strong>{entry.slug}.md</strong>
                    <Status>{entry.state}</Status>
                  </div>
                  <div className={styles.metadata}>
                    <span>revision {entry.revision}</span>
                    <span>{historicalTimestamp(entry.occurredAt)}</span>
                    <span>{entry.noteVersionId}</span>
                  </div>
                  {entry.error && <p>{entry.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className={styles.detailAside}>
        <form
          className={styles.inlineForm}
          onSubmit={async (event) => {
            event.preventDefault()
            const next = slug.trim().replace(/\.md$/i, '')
            if (!next || next === artifact.slug) return
            const result = await repository.artifactsV1.advance({
              artifactId,
              expectedRevision: artifact.revision,
              expectedProjectedHash: artifact.projectedHash,
              noteVersionId: artifact.noteVersionId,
              slug: next,
            })
            setNotice(
              resultNotice(
                result,
                'Rename queued against the current projection hash.',
              ),
            )
            if (result.ok) setRefresh((value) => value + 1)
          }}
        >
          <label>
            <span>Projection slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              aria-describedby="artifact-slug-help"
            />
          </label>
          <p id="artifact-slug-help" className={styles.prose}>
            Rename creates the new path before the old path is tombstoned. The
            projected Markdown is never imported over the note.
          </p>
          <button
            className={styles.button}
            disabled={
              busy ||
              !slug.trim() ||
              slug.trim().replace(/\.md$/i, '') === artifact.slug
            }
          >
            Queue rename
          </button>
        </form>
        <div className={styles.honesty}>
          <strong>Delete is a tombstone.</strong>
          <span>
            The matching projected version is removed by the node while history
            remains inspectable.
          </span>
        </div>
        <button
          className={styles.dangerButton}
          disabled={artifact.projectionState === 'tombstoned'}
          onClick={async () => {
            const result = await repository.artifactsV1.tombstone(
              artifactId,
              artifact.revision,
            )
            setNotice(resultNotice(result, 'Artifact tombstoned.'))
            if (result.ok) setRefresh((value) => value + 1)
          }}
        >
          Tombstone artifact
        </button>
      </aside>
    </div>
  )
}

function MemoryList({ repository }: { repository: WebRepository }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const visible = useMemo(
    () =>
      repository.knowledgeDocuments.filter(
        (item) =>
          (kind === 'all' || item.kind === kind) &&
          `${item.title} ${item.summary} ${item.tags.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [kind, query, repository.knowledgeDocuments],
  )
  if (repository.loading) return <Loading label="Loading Memory" />
  return (
    <>
      <div className={styles.honesty}>
        <strong>Derived, cited, reversible.</strong>
        <span>
          Memory is projected from the Markdown vault. Corrections append a new
          cited revision; they never rewrite history or turn Convex into a
          competing editor.
        </span>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.grow}>
          <span>Find people, projects, or topics</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Memory"
          />
        </label>
        <label>
          <span>Kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All kinds</option>
            <option value="person">People</option>
            <option value="project">Projects</option>
            <option value="topic">Topics</option>
            <option value="organization">Organizations</option>
            <option value="place">Places</option>
            <option value="event">Events</option>
          </select>
        </label>
      </div>
      <section className={styles.ruledSection}>
        <div className={styles.sectionHeader}>
          <h2>Living entities</h2>
          <span>{visible.length} visible</span>
        </div>
        {visible.length === 0 ? (
          <Empty
            title="No Memory entities match"
            body={
              repository.knowledgeDocuments.length === 0
                ? 'The node creates cited entity files after analyzing registered sources.'
                : 'Clear the search or choose a different kind.'
            }
          />
        ) : (
          <div className={styles.list}>
            {visible.map((item) => (
              <MemoryRow key={item.knowledgeDocumentId} item={item} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function MemoryRow({ item }: { item: KnowledgeDocumentItem }) {
  return (
    <article className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>
          <strong>{item.title}</strong>
          <Status>{item.kind}</Status>
          <Status>{item.syncState}</Status>
        </div>
        <p>{item.summary}</p>
        <div className={styles.metadata}>
          {item.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
          <span>{item.provenanceIds.length} provenance records</span>
          <span>rev {item.revision}</span>
        </div>
      </div>
      <Link
        className={styles.textLink}
        href={`/entities/${encodeURIComponent(item.knowledgeDocumentId)}`}
      >
        Open entity
      </Link>
    </article>
  )
}

function EntityDetail({
  repository,
  entityId,
}: {
  repository: WebRepository
  entityId: string
}) {
  const [detail, setDetail] = useState<
    MemoryEntityDetailItem | null | undefined
  >(undefined)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [target, setTarget] = useState('')
  const [targetKind, setTargetKind] = useState<'entity' | 'fact'>('entity')
  const [action, setAction] = useState<'retract' | 'replace'>('retract')
  const [replacement, setReplacement] = useState('')
  const [reason, setReason] = useState('')
  const [refresh, setRefresh] = useState(0)
  const document = repository.knowledgeDocuments.find(
    (item) => item.knowledgeDocumentId === entityId,
  )

  useEffect(() => {
    let active = true
    void repository.memoryV1
      .getEntity(entityId, 100)
      .then((value) => {
        if (active) setDetail(value)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Entity detail could not be read.',
          )
      })
    return () => {
      active = false
    }
    // repository is an accepted adapter whose method identity may change with snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, refresh])

  if (detail === undefined) return <Loading label="Loading entity detail" />
  if (error)
    return (
      <ErrorState
        message={error}
        retry={() => {
          setError(null)
          setDetail(undefined)
          setRefresh((value) => value + 1)
        }}
      />
    )
  if (detail === null && !document)
    return (
      <Empty
        title="Entity not found"
        body="The vault projection may have been tombstoned or has not reached this installation."
      />
    )
  const value = detail ?? {
    entityId,
    facts: [],
    relations: [],
    provenance: [],
    corrections: [],
    conflicts: [],
  }
  const expectedRevision =
    targetKind === 'fact'
      ? (value.facts.find((fact) => fact.factId === target)?.revision ?? 0)
      : (document?.revision ?? 0)
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailMain}>
        {notice && (
          <div className={styles.notice} data-tone={notice.tone}>
            {notice.text}
          </div>
        )}
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>{document?.title ?? entityId}</h2>
            <span>{document?.kind ?? 'entity'}</span>
          </div>
          {document?.summary && (
            <p className={styles.prose}>{document.summary}</p>
          )}
          <dl className={styles.facts}>
            {value.facts.length === 0 ? (
              <Empty
                title="No fact rows projected"
                body="The entity summary remains available, but the detail projection has no individual cited facts yet."
              />
            ) : (
              value.facts.map((fact) => (
                <div className={styles.fact} key={fact.factId}>
                  <dt>{fact.predicate}</dt>
                  <dd>
                    {fact.value}
                    <div className={styles.metadata}>
                      <span>
                        {Math.round(fact.confidence * 100)}% confidence
                      </span>
                      <span>{fact.sourceRefIds.length} sources</span>
                      <span>rev {fact.revision}</span>
                    </div>
                  </dd>
                  <button
                    className={styles.quietButton}
                    onClick={() => {
                      setTarget(fact.factId)
                      setTargetKind('fact')
                      setAction('retract')
                    }}
                  >
                    Correct
                  </button>
                </div>
              ))
            )}
          </dl>
        </section>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>Relations</h2>
            <span>{value.relations.length}</span>
          </div>
          {value.relations.length === 0 ? (
            <Empty
              title="No relations projected"
              body="Relationships appear after cited evidence connects this entity to another."
            />
          ) : (
            <div className={styles.list}>
              {value.relations.map((relation) => (
                <div className={styles.row} key={relation.relationId}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <strong>{relation.relationType}</strong>
                    </div>
                    <div className={styles.metadata}>
                      <span>{relation.fromEntityId}</span>
                      <span>→</span>
                      <span>{relation.toEntityId}</span>
                      <span>
                        {Math.round(relation.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>Evidence</h2>
            <span>{value.provenance.length} links</span>
          </div>
          {value.provenance.length === 0 ? (
            <Empty
              title="No excerpt-level evidence projected"
              body="Source IDs on the summary remain available while the node prepares exact locators."
            />
          ) : (
            <div className={styles.list}>
              {value.provenance.map((item) => (
                <div className={styles.row} key={item.provenanceLinkId}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <strong>{item.sourceRefId}</strong>
                    </div>
                    <p>
                      {item.excerpt ?? item.locator ?? 'Cited source record'}
                    </p>
                  </div>
                  <Link
                    className={styles.textLink}
                    href={`/sources/${encodeURIComponent(item.sourceRefId)}`}
                  >
                    Open source
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <aside className={styles.detailAside}>
        <h2>Correct Memory</h2>
        <p className={styles.prose}>
          A correction appends an auditable request. The node applies it as a
          new vault revision; replaying an older source cannot silently
          resurrect a retracted fact.
        </p>
        <form
          className={styles.correctionForm}
          onSubmit={async (event) => {
            event.preventDefault()
            if (
              !target.trim() ||
              !reason.trim() ||
              (action === 'replace' && !replacement.trim())
            )
              return
            const result = await repository.memoryV1.createCorrection({
              correctionId: `correction:${crypto.randomUUID()}`,
              targetKind,
              targetId: target.trim(),
              action,
              replacement:
                action === 'replace' ? replacement.trim() : undefined,
              reason: reason.trim(),
              actor: 'owner',
              origin: 'web',
              expectedRevision,
            })
            setNotice(
              resultNotice(
                result,
                'Correction recorded and waiting for the node to apply.',
              ),
            )
            if (result.ok) {
              setTarget('')
              setTargetKind('entity')
              setReplacement('')
              setReason('')
              setRefresh((value) => value + 1)
            }
          }}
        >
          <label>
            <span>Target type</span>
            <select
              value={targetKind}
              onChange={(event) =>
                setTargetKind(event.target.value as 'entity' | 'fact')
              }
            >
              <option value="entity">Entity</option>
              <option value="fact">Fact</option>
            </select>
          </label>
          <label>
            <span>Fact or entity ID</span>
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={
                targetKind === 'fact'
                  ? (value.facts[0]?.factId ?? 'fact:…')
                  : entityId
              }
              required
            />
          </label>
          <label>
            <span>Action</span>
            <select
              value={action}
              onChange={(event) =>
                setAction(event.target.value as 'retract' | 'replace')
              }
            >
              <option value="retract">Retract</option>
              <option value="replace">Replace</option>
            </select>
          </label>
          {action === 'replace' && (
            <label>
              <span>Replacement</span>
              <textarea
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            <span>Reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What is wrong, and what evidence should be preferred?"
              required
            />
          </label>
          <button
            className={styles.button}
            disabled={
              !target.trim() ||
              !reason.trim() ||
              (action === 'replace' && !replacement.trim())
            }
          >
            Record correction
          </button>
        </form>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h3>Correction history</h3>
            <span>{value.corrections.length}</span>
          </div>
          {value.corrections.length === 0 ? (
            <Empty
              title="No corrections"
              body="Changes and restores will remain visible here."
            />
          ) : (
            <div className={styles.list}>
              {value.corrections.map((correction) => (
                <div className={styles.row} key={correction.correctionId}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <strong>{correction.action}</strong>
                      <Status>{correction.state}</Status>
                    </div>
                    <p>{correction.reason}</p>
                    <div className={styles.metadata}>
                      <span>{correction.targetId}</span>
                      <span>{correction.actor}</span>
                    </div>
                  </div>
                  {correction.state === 'applied' && (
                    <button
                      className={styles.quietButton}
                      onClick={async () => {
                        const result =
                          await repository.memoryV1.restoreCorrection(
                            correction.correctionId,
                            correction.appliedRevision ??
                              correction.expectedRevision,
                          )
                        setNotice(resultNotice(result, 'Restore recorded.'))
                        if (result.ok) setRefresh((value) => value + 1)
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        {value.conflicts.length > 0 && (
          <section className={styles.ruledSection}>
            <div className={styles.sectionHeader}>
              <h3>Conflicts</h3>
              <span>{value.conflicts.length}</span>
            </div>
            <div className={styles.list}>
              {value.conflicts.map((conflict) => (
                <div className={styles.row} key={conflict.correctionId}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <strong>{conflict.targetId}</strong>
                      <Status>conflict</Status>
                    </div>
                    <p>{conflict.conflict ?? conflict.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}

function SourceDetail({
  repository,
  sourceRefId,
}: {
  repository: WebRepository
  sourceRefId: string
}) {
  const [detail, setDetail] = useState<SourceDetailItem | null | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'transcript' | 'extracted'>('transcript')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    void repository.sourceDetailsV1
      .getDetail(sourceRefId, {
        excerpts: 100,
        extractions: 100,
        derivedChanges: 100,
      })
      .then((value) => {
        if (active) setDetail(value)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Source detail could not be read.',
          )
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRefId, refresh])

  if (detail === undefined) return <Loading label="Loading source detail" />
  if (error)
    return (
      <ErrorState
        message={error}
        retry={() => {
          setError(null)
          setDetail(undefined)
          setRefresh((value) => value + 1)
        }}
      />
    )
  if (detail === null)
    return (
      <Empty
        title="Source not found"
        body="The reference may have been removed or has not synchronized to this installation."
      />
    )
  const source = detail.source
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailMain}>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>{source.displayName}</h2>
            <div>
              <Status>{source.syncState}</Status>{' '}
              <Status>{source.indexState}</Status>
            </div>
          </div>
          <div className={styles.metadata}>
            <span>{source.kind}</span>
            <span>rev {source.revision}</span>
            {source.contentHash && (
              <span className={styles.hash}>
                {source.contentHash.slice(0, 16)}
              </span>
            )}
          </div>
          <div className={styles.honesty}>
            <strong>
              {source.sourceUrl
                ? 'Referenced at the origin.'
                : 'Private node reference.'}
            </strong>
            <span>
              {source.sourceUrl
                ? 'Kriyan keeps the location and derived transcript; the origin remains authoritative.'
                : 'The browser receives metadata and bounded evidence, not raw private bytes or node paths.'}
            </span>
          </div>
          {source.sourceUrl && (
            <a
              className={styles.textLink}
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open original ↗
            </a>
          )}
        </section>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>Evidence</h2>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Source evidence"
            >
              <button
                role="tab"
                aria-selected={tab === 'transcript'}
                onClick={() => setTab('transcript')}
              >
                Transcript
              </button>
              <button
                role="tab"
                aria-selected={tab === 'extracted'}
                onClick={() => setTab('extracted')}
              >
                Extracted
              </button>
            </div>
          </div>
          {tab === 'transcript' ? (
            <div role="tabpanel">
              {detail.transcriptPreview ? (
                <p className={styles.prose}>{detail.transcriptPreview}</p>
              ) : detail.excerpts.length === 0 ? (
                <Empty
                  title="No transcript text projected"
                  body="The original can remain at its location while the node creates bounded excerpts for Convex."
                />
              ) : (
                <div className={styles.list}>
                  {detail.excerpts.map((excerpt) => (
                    <figure className={styles.excerpt} key={excerpt.excerptId}>
                      <blockquote>{excerpt.text}</blockquote>
                      <footer>
                        {excerpt.speaker && `${excerpt.speaker} · `}offset{' '}
                        {excerpt.startOffset}–{excerpt.endOffset}
                      </footer>
                    </figure>
                  ))}
                </div>
              )}
              {(detail.transcriptTruncated || detail.excerptsTruncated) && (
                <p className={styles.notice}>
                  This browser view is intentionally bounded. Ask the node to
                  inspect the source for deeper context.
                </p>
              )}
            </div>
          ) : (
            <div role="tabpanel">
              {detail.extractions.length === 0 ? (
                <Empty
                  title="Nothing structured yet"
                  body="Entities, decisions, risks, and actions appear here after analysis."
                />
              ) : (
                <dl className={styles.facts}>
                  {detail.extractions.map((item) => (
                    <div className={styles.fact} key={item.extractionId}>
                      <dt>{item.label}</dt>
                      <dd>
                        {item.value}
                        <div className={styles.metadata}>
                          <span>{item.kind}</span>
                          <span>
                            {item.provenanceIds.length} provenance links
                          </span>
                        </div>
                      </dd>
                      {item.confidence !== undefined ? (
                        <span>{Math.round(item.confidence * 100)}%</span>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </dl>
              )}
              {detail.extractionsTruncated && (
                <p className={styles.notice}>
                  Additional extracted fields are available through bounded
                  pagination on the node.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <aside className={styles.detailAside}>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>What this changed</h2>
            <span>{detail.derivedChanges.length}</span>
          </div>
          {detail.derivedChanges.length === 0 ? (
            <Empty
              title="No derived changes"
              body="Tasks and Memory updates created from this source will remain traceable here."
            />
          ) : (
            <div className={styles.list}>
              {detail.derivedChanges.map((change) => (
                <div className={styles.row} key={change.changeId}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <strong>{change.summary}</strong>
                      <Status>
                        {change.revertedAt ? 'restored' : change.origin}
                      </Status>
                    </div>
                    <div className={styles.metadata}>
                      <span>{change.targetKind}</span>
                      <span>{change.targetId}</span>
                      <span>rev {change.afterRevision}</span>
                    </div>
                  </div>
                  {change.targetKind === 'task' && (
                    <Link className={styles.textLink} href="/tasks">
                      Open task
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className={styles.ruledSection}>
          <div className={styles.sectionHeader}>
            <h2>Retention</h2>
            <span>explicit</span>
          </div>
          <p className={styles.prose}>
            {source.kind === 'git' || source.kind === 'web'
              ? 'Kriyan can inspect a temporary clone or download, update the transcript and Memory, then delete temporary bytes. The URL and pinned identity remain.'
              : 'Captured originals stay only where the source policy says they should. Convex stores bounded metadata, transcript evidence, and provenance—not a hidden duplicate library.'}
          </p>
        </section>
      </aside>
    </div>
  )
}
