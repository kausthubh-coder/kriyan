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
  versions: NoteDraft[]
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
    return value.flatMap((item): PersistedNote[] => {
      if (!item || typeof item !== 'object') return []
      const note = item as Partial<PersistedNote>
      const { key, draft, artifacts } = note
      if (
        typeof key !== 'string' ||
        draft === undefined ||
        typeof draft.contentJson !== 'string' ||
        typeof draft.plainTextPreview !== 'string' ||
        !Array.isArray(draft.tags) ||
        !Array.isArray(artifacts)
      ) return []

      const versions = Array.isArray(note.versions)
        ? note.versions.filter(
            (version): version is NoteDraft =>
              Boolean(version) &&
              typeof version.contentJson === 'string' &&
              typeof version.plainTextPreview === 'string' &&
              Array.isArray(version.tags),
          )
        : [draft]
      if (versions.length === 0) return []
      return [{
        key,
        draft,
        versions,
        artifacts,
      }]
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
    versions: [...(current?.versions ?? []), draft],
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
  if (!runtimeNoteKeys.has(note.noteId)) {
    persistDemoNote(repository, note.noteId, draftFromNote(note))
  }
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
    const versions = saved.versions.length > 0 ? saved.versions : [saved.draft]
    const firstVersion = versions[0]!
    const matchingNote = repository.notes.find(
      (note) =>
        note.title === saved.draft.title &&
        note.contentJson === saved.draft.contentJson,
    )
    const created = matchingNote
      ? { ok: true as const, value: matchingNote }
      : await repository.createNote(firstVersion)
    if (!created.ok) continue
    let currentNote = created.value
    if (!matchingNote) {
      for (const version of versions.slice(1)) {
        const updated = await repository.updateNote(currentNote, version)
        if (!updated.ok) break
        currentNote = {
          ...currentNote,
          ...version,
          revision: currentNote.revision + 1,
        }
      }
    }
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
