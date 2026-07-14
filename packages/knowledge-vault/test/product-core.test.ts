import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { ArtifactProjectionStore, MemoryLedger } from '../src'

test('artifact projection is monotonic, replay safe, rename-first, tombstoned, and reconcilable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-artifacts-'))
  try {
    const store = new ArtifactProjectionStore(root)
    const newer = await store.materialize({
      artifactId: 'artifact:korean',
      noteId: 'note:korean',
      noteVersionId: 'note-version:korean:2',
      version: 2,
      contentHash: 'sha256:content-2',
      contentJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Practice every day."}]}]}',
      title: 'Korean',
      plainText: 'Practice every day.',
      projectedPath: 'artifacts/korean.md',
    })
    expect(newer.status).toBe('written')
    if (newer.status !== 'written') throw new Error('projection fixture failed')

    const stale = await store.materialize({
      artifactId: 'artifact:korean',
      noteId: 'note:korean',
      noteVersionId: 'note-version:korean:1',
      version: 1,
      contentHash: 'sha256:content-1',
      contentJson: '{"type":"doc"}',
      title: 'Old Korean',
      plainText: 'Old content.',
      projectedPath: 'artifacts/korean.md',
    })
    expect(stale.status).toBe('stale')
    expect(await readFile(join(root, 'artifacts/korean.md'), 'utf8')).toContain('Practice every day.')

    const replay = await store.materialize({
      artifactId: 'artifact:korean',
      noteId: 'note:korean',
      noteVersionId: 'note-version:korean:2',
      version: 2,
      contentHash: 'sha256:content-2',
      contentJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Practice every day."}]}]}',
      title: 'Korean',
      plainText: 'Practice every day.',
      projectedPath: 'artifacts/korean.md',
    })
    expect(replay.status).toBe('replayed')

    const renamed = await store.materialize({
      artifactId: 'artifact:korean',
      noteId: 'note:korean',
      noteVersionId: 'note-version:korean:3',
      version: 3,
      contentHash: 'sha256:content-3',
      contentJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Practice twice every day."}]}]}',
      title: 'Korean study',
      plainText: 'Practice twice every day.',
      projectedPath: 'artifacts/korean-study.md',
      priorProjectedHash: newer.record.projectedHash,
      priorProjectedPath: 'artifacts/korean.md',
    })
    expect(renamed.status).toBe('written')
    expect(await store.files.exists('artifacts/korean-study.md')).toBe(true)
    expect(await store.files.exists('artifacts/korean.md')).toBe(false)

    expect(await store.tombstone('artifact:korean', 'note-version:korean:2')).toBe('stale')
    expect(await store.tombstone('artifact:korean', 'note-version:korean:3')).toBe('tombstoned')
    expect(await store.files.exists('artifacts/korean-study.md')).toBe(false)

    const keep = await store.materialize({
      artifactId: 'artifact:keep', noteId: 'note:keep', noteVersionId: 'version:keep:1',
      version: 1, contentHash: 'sha256:keep', title: 'Keep', plainText: 'Keep me.',
      contentJson: '{"type":"doc"}',
      projectedPath: 'artifacts/keep.md',
    })
    await store.files.write('artifacts/orphan.md', 'orphan\n')
    if (keep.status !== 'written') throw new Error('keep fixture failed')
    const reconciled = await store.reconcile([keep.record])
    expect(reconciled.removedOrphans).toEqual(['artifacts/orphan.md'])
    expect((await store.records()).map((record) => record.artifactId)).toEqual(['artifact:keep'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('memory correction retract, replace, restore, replay, and reconcile stay append-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-memory-ledger-'))
  try {
    const ledger = new MemoryLedger(root)
    const fact = {
      targetKind: 'fact',
      targetId: 'fact:korean:cadence',
      revision: 1,
      value: 'daily',
      provenanceIds: ['citation:course:1'],
    }
    expect((await ledger.project(fact)).status).toBe('projected')
    expect(await ledger.correct({
      correctionId: 'correction:retract', targetKind: fact.targetKind, targetId: fact.targetId,
      action: 'retract', reason: 'Wrong cadence', revision: 2,
      provenanceIds: ['citation:owner:1'],
    })).toBe('applied')
    expect((await ledger.project({ ...fact, revision: 2 })).status).toBe('suppressed')

    expect(await ledger.correct({
      correctionId: 'correction:restore', targetKind: fact.targetKind, targetId: fact.targetId,
      action: 'restore', reason: 'Original was right', revision: 3,
      provenanceIds: ['citation:owner:2'],
    })).toBe('applied')
    expect((await ledger.project({ ...fact, revision: 3 })).status).toBe('projected')

    expect(await ledger.correct({
      correctionId: 'correction:replace', targetKind: fact.targetKind, targetId: fact.targetId,
      action: 'replace', replacement: 'twice daily', reason: 'More precise', revision: 4,
      provenanceIds: ['citation:owner:3'],
    })).toBe('applied')
    const replaced = await ledger.project({ ...fact, revision: 4, value: 'daily' })
    expect(replaced.status).toBe('projected')
    expect(replaced.record?.value).toBe('twice daily')
    expect((await ledger.project({ ...fact, revision: 4, value: 'daily' })).status).toBe('replayed')
    const conflict = await ledger.project({ ...fact, revision: 5, value: 'weekly' })
    expect(conflict.status).toBe('conflict')
    if (conflict.status !== 'conflict') throw new Error('conflict fixture failed')
    expect(conflict.correction?.correctionId).toBe('correction:replace')

    const reconciled = await ledger.reconcile([])
    expect(reconciled.tombstoned).toEqual([fact.targetId])
    const reopened = await new MemoryLedger(root).snapshot()
    expect(reopened.records).toEqual([expect.objectContaining({
      targetId: fact.targetId,
      value: 'twice daily',
      tombstoned: true,
    })])
    expect(reopened.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: reopened.events.length }, (_, index) => index + 1),
    )
    expect(reopened.corrections).toEqual([expect.objectContaining({
      correctionId: 'correction:replace',
      action: 'replace',
      replacement: 'twice daily',
    })])
    const correctionFiles = await Array.fromAsync(new Bun.Glob('memory-revisions/**/*.md').scan({ cwd: root }))
    expect(correctionFiles).toHaveLength(3)
    expect(await readFile(join(root, correctionFiles.find((path) => path.endsWith('.md'))!), 'utf8')).toContain('memory-correction-revision')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
