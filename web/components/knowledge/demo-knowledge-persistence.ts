'use client'

import type { AppNoteItem, ArtifactItem } from '@kriyan/client-core'

import type {
  NoteDraft,
  WebRepository,
} from '@/src/client-core/web-repository'

const STORAGE_KEY = 'kriyan:offline-demo:knowledge:v1'

interface PersistedArtifact {
  artifactId: string
  noteVersionId: string
  slug: string
}

interface PersistedNote {
  key: string
  draft: NoteDraft
  artifacts: PersistedArtifact[]
}

const runtimeNoteKeys = new Map<string, string>()

function isDemoRepository(repository: WebRepository): boolean {
  return repository.installation?.installationId === 'installation:memory'
}

function readNotes(): PersistedNote[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is PersistedNote => {
      if (!item || typeof item !== 'object') return false
      const note = item as Partial<PersistedNote>
      return (
        typeof note.key === 'string' &&
        note.draft !== undefined &&
        typeof note.draft.contentJson === 'string' &&
        typeof note.draft.plainTextPreview === 'string' &&
        Array.isArray(note.draft.tags) &&
        Array.isArray(note.artifacts)
      )
    })
  } catch {
    return []
  }
}

function writeNotes(notes: PersistedNote[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Demo persistence is best-effort when browser storage is unavailable.
  }
}

function draftFromNote(note: AppNoteItem): NoteDraft {
  return {
    title: note.title,
    contentJson: note.contentJson,
    plainTextPreview: note.plainTextPreview,
    wordCount: note.wordCount,
    tags: note.tags,
    entityId: note.entityId,
  }
}

export function persistDemoNote(
  repository: WebRepository,
  noteId: string,
  draft: NoteDraft,
): void {
  if (!isDemoRepository(repository)) return
  const notes = readNotes()
  const knownKey = runtimeNoteKeys.get(noteId)
  const key = knownKey ?? crypto.randomUUID()
  const index = notes.findIndex((note) => note.key === key)
  const current = index >= 0 ? notes[index] : undefined
  const next: PersistedNote = {
    key,
    draft,
    artifacts: current?.artifacts ?? [],
  }
  if (index >= 0) notes[index] = next
  else notes.push(next)
  runtimeNoteKeys.set(noteId, key)
  writeNotes(notes)
}

export function persistDemoArtifact(
  repository: WebRepository,
  note: AppNoteItem,
  artifact: ArtifactItem,
): void {
  if (!isDemoRepository(repository)) return
  persistDemoNote(repository, note.noteId, draftFromNote(note))
  const key = runtimeNoteKeys.get(note.noteId)
  if (!key) return
  const notes = readNotes()
  const index = notes.findIndex((item) => item.key === key)
  if (index < 0) return
  const current = notes[index]
  if (!current) return
  const artifacts = current.artifacts.filter(
    (item) => item.artifactId !== artifact.artifactId,
  )
  artifacts.push({
    artifactId: artifact.artifactId,
    noteVersionId: artifact.noteVersionId,
    slug: artifact.slug,
  })
  notes[index] = { ...current, artifacts }
  writeNotes(notes)
}

export async function restoreDemoKnowledge(
  repository: WebRepository,
): Promise<void> {
  if (!isDemoRepository(repository)) return
  for (const saved of readNotes()) {
    const matchingNote = repository.notes.find(
      (note) =>
        note.title === saved.draft.title &&
        note.contentJson === saved.draft.contentJson,
    )
    const created = matchingNote
      ? { ok: true as const, value: matchingNote }
      : await repository.createNote(saved.draft)
    if (!created.ok) continue
    runtimeNoteKeys.set(created.value.noteId, saved.key)
    const history = await repository.noteDetailsV1.getHistory(
      created.value.noteId,
      1,
    )
    const noteVersionId = history?.versions[0]?.noteVersionId
    for (const artifact of saved.artifacts) {
      if (await repository.artifactsV1.get(artifact.artifactId)) continue
      await repository.artifactsV1.create({
        artifactId: artifact.artifactId,
        noteId: created.value.noteId,
        noteVersionId: noteVersionId ?? artifact.noteVersionId,
        slug: artifact.slug,
      })
    }
  }
}
