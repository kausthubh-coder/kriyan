'use client'

import {
  normalizeTransitionReason,
  type ActionResult,
  type AppNoteItem,
  type ArtifactItem,
  type NoteHistoryItem,
  type NoteVersionItem,
  type ProductMutationResult,
} from '@kriyan/client-core'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  persistDemoArtifact,
  persistDemoNote,
  restoreDemoKnowledge,
} from '@/components/knowledge/demo-knowledge-persistence'
import type { WebRepository } from '@/src/client-core/web-repository'

import { NoteEditor } from './note-editor'
import styles from './productivity.module.css'
import type { ResultHandler } from './workspaces'

type Selected = AppNoteItem | 'new' | null

function mutationResult(result: ProductMutationResult<unknown>): ActionResult {
  return result.ok
    ? { ok: true, value: undefined }
    : {
        ok: false,
        reason: normalizeTransitionReason(result.reason),
        message: result.message,
      }
}

function versionTimestamp(createdAt: number): string {
  return Number.isFinite(createdAt) && createdAt >= Date.UTC(2000, 0, 1)
    ? new Date(createdAt).toLocaleString()
    : 'Timestamp unavailable'
}

function versionLabel(version: NoteVersionItem): string {
  return `v${version.version} · ${version.authorOrigin} · ${versionTimestamp(version.createdAt)}`
}

export function NotesWorkspace({
  repository,
  onResult,
}: {
  repository: WebRepository
  onResult: ResultHandler
}) {
  const [selected, setSelected] = useState<Selected>(null)
  const [history, setHistory] = useState<NoteHistoryItem | null | undefined>(
    undefined,
  )
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([])
  const [historyError, setHistoryError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [targetKind, setTargetKind] = useState('source')
  const [targetId, setTargetId] = useState('')
  const [relation, setRelation] = useState('references')
  const [slug, setSlug] = useState('')
  const [inspectedVersion, setInspectedVersion] =
    useState<NoteVersionItem | null>(null)
  const restoredDemo = useRef(false)
  const selectedId = selected && selected !== 'new' ? selected.noteId : null
  const noteKey = repository.notes
    .map((note) => `${note.noteId}:${note.revision}`)
    .join('|')

  useEffect(() => {
    if (repository.loading || restoredDemo.current) return
    restoredDemo.current = true
    void restoreDemoKnowledge(repository)
    // The repository adapter changes identity as snapshots arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository.loading])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    void Promise.all([
      repository.noteDetailsV1.getHistory(selectedId, 100),
      repository.artifactsV1.listByNote(selectedId, true),
    ])
      .then(([nextHistory, nextArtifacts]) => {
        if (!active) return
        setHistory(nextHistory)
        setArtifacts(nextArtifacts)
        setInspectedVersion((current) =>
          current &&
          nextHistory?.versions.some(
            (item) => item.noteVersionId === current.noteVersionId,
          )
            ? current
            : null,
        )
      })
      .catch((cause: unknown) => {
        if (active)
          setHistoryError(
            cause instanceof Error
              ? cause.message
              : 'Version history could not be loaded.',
          )
      })
    return () => {
      active = false
    }
    // Detail ports are intentionally refreshed after a base note revision or local mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, noteKey, refresh])

  const currentNote =
    selected && selected !== 'new'
      ? (repository.notes.find((note) => note.noteId === selected.noteId) ??
        selected)
      : undefined
  const currentVersionId =
    currentNote?.currentVersionId ?? history?.versions[0]?.noteVersionId
  const currentVersion = history?.versions.find(
    (item) => item.noteVersionId === currentVersionId,
  )
  const selectedArtifacts = useMemo(
    () =>
      [...artifacts].sort((left, right) => right.updatedAt - left.updatedAt),
    [artifacts],
  )

  return (
    <div className="notes-layout">
      <aside className="notes-list" aria-label="Notes">
        <button
          className="primary-button"
          onClick={() => {
            setSelected('new')
            setHistory(undefined)
            setInspectedVersion(null)
          }}
        >
          New note
        </button>
        {repository.loading && (
          <div className="skeleton-list" aria-label="Loading notes">
            <div>
              <i />
              <span />
            </div>
            <div>
              <i />
              <span />
            </div>
          </div>
        )}
        {!repository.loading && repository.notes.length === 0 && (
          <div className="note-empty">
            <strong>No notes yet.</strong>
            <span>
              Start a durable TipTap note. The editor does not depend on the
              agent node being online.
            </span>
          </div>
        )}
        {repository.notes.map((note) => (
          <button
            key={note.noteId}
            className={
              selected !== 'new' && selected?.noteId === note.noteId
                ? 'active'
                : ''
            }
            onClick={() => {
              setSelected(note)
              setHistory(undefined)
              setArtifacts([])
              setHistoryError('')
              setInspectedVersion(null)
            }}
          >
            <strong>{note.title || 'Untitled note'}</strong>
            <span>{note.plainTextPreview || 'Empty note'}</span>
            <small>
              {note.wordCount} words · rev {note.revision}
            </small>
          </button>
        ))}
        <div className="continuation">
          <span>{repository.pages.notes.loadedCount} loaded</span>
          {repository.pages.notes.canLoadMore && (
            <button
              className="quiet-button"
              onClick={() => repository.loadMore('notes')}
              disabled={repository.pages.notes.loadingMore}
            >
              {repository.pages.notes.loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </aside>

      <div>
        {selected ? (
          <>
            <NoteEditor
              key={selected === 'new' ? 'new' : selected.noteId}
              note={currentNote}
              busy={repository.pending.has(
                selected === 'new' ? 'note:create' : `note:${selected.noteId}`,
              )}
              onCancel={() => setSelected(null)}
              onSave={async (draft) => {
                if (selected === 'new') {
                  const result = await repository.createNote(draft)
                  onResult(
                    result,
                    'Note created with an immutable committed version.',
                  )
                  if (result.ok) {
                    persistDemoNote(repository, result.value.noteId, draft)
                    setSelected(result.value)
                    setRefresh((value) => value + 1)
                  }
                  return result.ok
                }
                const noteToUpdate = currentNote ?? selected
                const result = await repository.updateNote(noteToUpdate, draft)
                onResult(result, 'Note saved as a new immutable version.')
                if (result.ok) {
                  persistDemoNote(repository, noteToUpdate.noteId, draft)
                  setRefresh((value) => value + 1)
                }
                return result.ok
              }}
            />
            {currentNote && (
              <div className={styles.detailGrid}>
                <div className={styles.detailMain}>
                  <section className={styles.ruledSection}>
                    <div className={styles.sectionHeader}>
                      <h2>Version history</h2>
                      <span>{history?.versions.length ?? 0} committed</span>
                    </div>
                    {historyError ? (
                      <div className={styles.error} role="alert">
                        <strong>History unavailable</strong>
                        <p>{historyError}</p>
                        <button
                          className={styles.quietButton}
                          onClick={() => {
                            setHistoryError('')
                            setHistory(undefined)
                            setRefresh((value) => value + 1)
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    ) : history === undefined ? (
                      <div
                        className={styles.loading}
                        aria-label="Loading note history"
                      >
                        <span className={styles.skeleton} />
                        <span className={styles.skeleton} />
                      </div>
                    ) : history === null || history.versions.length === 0 ? (
                      <div className={styles.empty}>
                        <strong>No committed versions</strong>
                        <p>
                          Save the note to create its first immutable version.
                        </p>
                      </div>
                    ) : (
                      <div className={styles.list}>
                        {history.versions.map((version) => (
                          <button
                            className={styles.row}
                            key={version.noteVersionId}
                            onClick={() => setInspectedVersion(version)}
                            aria-pressed={
                              inspectedVersion?.noteVersionId ===
                              version.noteVersionId
                            }
                          >
                            <span className={styles.rowMain}>
                              <span className={styles.rowTitle}>
                                <strong>Version {version.version}</strong>
                                {version.noteVersionId === currentVersionId && (
                                  <span
                                    className={styles.status}
                                    data-tone="success"
                                  >
                                    current
                                  </span>
                                )}
                              </span>
                              <span className={styles.metadata}>
                                <span>{version.authorOrigin}</span>
                                <span>{version.wordCount} words</span>
                                <span className={styles.hash}>
                                  {version.contentHash.slice(0, 12)}
                                </span>
                                <span>
                                  {versionTimestamp(version.createdAt)}
                                </span>
                              </span>
                            </span>
                            <span className={styles.textLink}>Inspect</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {inspectedVersion && (
                      <div className={styles.notice}>
                        <strong>{versionLabel(inspectedVersion)}</strong>
                        <p className={styles.prose}>
                          {inspectedVersion.plainTextPreview ||
                            'This committed version has no plain-text content.'}
                        </p>
                        <span className={styles.hash}>
                          {inspectedVersion.contentHash}
                        </span>
                      </div>
                    )}
                  </section>

                  <section className={styles.ruledSection}>
                    <div className={styles.sectionHeader}>
                      <h2>Typed links and citations</h2>
                      <span>
                        {history?.links.filter(
                          (item) => item.deletedAt === undefined,
                        ).length ?? 0}{' '}
                        active
                      </span>
                    </div>
                    {history?.links
                      .filter((item) => item.deletedAt === undefined)
                      .map((link) => (
                        <div className={styles.row} key={link.noteLinkId}>
                          <div className={styles.rowMain}>
                            <div className={styles.rowTitle}>
                              <strong>{link.relation}</strong>
                              <span
                                className={styles.status}
                                data-tone="active"
                              >
                                {link.targetKind}
                              </span>
                            </div>
                            <div className={styles.metadata}>
                              <span>{link.targetId}</span>
                              <span>
                                {link.provenanceIds.length} provenance links
                              </span>
                              <span>rev {link.revision}</span>
                            </div>
                          </div>
                          <button
                            className={styles.dangerButton}
                            onClick={async () => {
                              const result =
                                await repository.noteDetailsV1.tombstoneLink(
                                  link.noteLinkId,
                                  link.revision,
                                )
                              onResult(
                                mutationResult(result),
                                result.ok
                                  ? 'Link removed without rewriting note history.'
                                  : undefined,
                              )
                              if (result.ok) setRefresh((value) => value + 1)
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    <form
                      className={styles.inlineForm}
                      onSubmit={async (event) => {
                        event.preventDefault()
                        if (!targetId.trim() || !relation.trim()) return
                        const result =
                          await repository.noteDetailsV1.createLink({
                            noteLinkId: `note-link:${crypto.randomUUID()}`,
                            noteId: currentNote.noteId,
                            targetKind,
                            targetId: targetId.trim(),
                            relation: relation.trim(),
                            provenanceIds: [],
                            idempotencyKey: `note-link-intent:${crypto.randomUUID()}`,
                          })
                        onResult(
                          mutationResult(result),
                          result.ok ? 'Typed link added.' : undefined,
                        )
                        if (result.ok) {
                          setTargetId('')
                          setRefresh((value) => value + 1)
                        }
                      }}
                    >
                      <label>
                        <span>Target type</span>
                        <select
                          value={targetKind}
                          onChange={(event) =>
                            setTargetKind(event.target.value)
                          }
                        >
                          <option value="source">Source</option>
                          <option value="entity">Memory entity</option>
                          <option value="task">Task</option>
                          <option value="run">Agent run</option>
                          <option value="note">Note</option>
                        </select>
                      </label>
                      <label>
                        <span>Target ID</span>
                        <input
                          value={targetId}
                          onChange={(event) => setTargetId(event.target.value)}
                          placeholder={`${targetKind}:…`}
                          required
                        />
                      </label>
                      <label>
                        <span>Relationship</span>
                        <input
                          value={relation}
                          onChange={(event) => setRelation(event.target.value)}
                          placeholder="references"
                          required
                        />
                      </label>
                      <button
                        className={styles.quietButton}
                        disabled={!targetId.trim() || !relation.trim()}
                      >
                        Add link
                      </button>
                    </form>
                  </section>
                </div>

                <aside className={styles.detailAside}>
                  <section className={styles.ruledSection}>
                    <div className={styles.sectionHeader}>
                      <h2>Artifact projection</h2>
                      <span>{selectedArtifacts.length}</span>
                    </div>
                    <div className={styles.honesty}>
                      <strong>Read-only output.</strong>
                      <span>
                        The Markdown artifact points at a committed version. It
                        is never imported back over this editor.
                      </span>
                    </div>
                    {selectedArtifacts.map((artifact) => (
                      <div className={styles.row} key={artifact.artifactId}>
                        <div className={styles.rowMain}>
                          <div className={styles.rowTitle}>
                            <strong>{artifact.slug}.md</strong>
                            <span
                              className={styles.status}
                              data-tone={
                                artifact.projectionState === 'projected'
                                  ? 'success'
                                  : artifact.projectionState === 'failed'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {artifact.projectionState}
                            </span>
                          </div>
                          <div className={styles.metadata}>
                            <span>rev {artifact.revision}</span>
                            {artifact.projectedHash && (
                              <span className={styles.hash}>
                                {artifact.projectedHash.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          className={styles.textLink}
                          href={`/artifacts/${encodeURIComponent(artifact.artifactId)}`}
                        >
                          Inspect
                        </Link>
                      </div>
                    ))}
                    <form
                      className={styles.inlineForm}
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const normalized = slug.trim().replace(/\.md$/i, '')
                        if (!currentVersionId || !normalized) return
                        const result = await repository.artifactsV1.create({
                          artifactId: `artifact:${crypto.randomUUID()}`,
                          noteId: currentNote.noteId,
                          noteVersionId: currentVersionId,
                          slug: normalized,
                        })
                        onResult(
                          mutationResult(result),
                          result.ok
                            ? 'Artifact materialization queued from the current committed version.'
                            : undefined,
                        )
                        if (result.ok) {
                          persistDemoArtifact(
                            repository,
                            currentNote,
                            result.value,
                          )
                          setSlug('')
                          setRefresh((value) => value + 1)
                        }
                      }}
                    >
                      <label>
                        <span>Markdown slug</span>
                        <input
                          value={slug}
                          onChange={(event) => setSlug(event.target.value)}
                          placeholder="kriyan-operating-principles"
                        />
                      </label>
                      <button
                        className={styles.button}
                        disabled={!currentVersionId || !slug.trim()}
                      >
                        Create artifact
                      </button>
                      {!currentVersionId && (
                        <p className={styles.prose}>
                          Save the note once before creating an artifact.
                        </p>
                      )}
                      {currentVersion && (
                        <p className={styles.prose}>
                          Will project version {currentVersion.version} (
                          {currentVersion.contentHash.slice(0, 10)}).
                        </p>
                      )}
                    </form>
                  </section>
                  <button
                    className={styles.dangerButton}
                    onClick={async () => {
                      const result = await repository.deleteNote(currentNote)
                      onResult(
                        result,
                        'Note archived. Its immutable versions and artifact history remain inspectable.',
                      )
                      if (result.ok) setSelected(null)
                    }}
                    disabled={repository.pending.has(
                      `note:${currentNote.noteId}`,
                    )}
                  >
                    Archive note
                  </button>
                </aside>
              </div>
            )}
          </>
        ) : (
          <div className="note-empty">
            <strong>Select a note or start a new one.</strong>
            <span>
              Notes remain editable when the agent node is offline because
              Convex—not the node or Markdown projection—is the write authority.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
