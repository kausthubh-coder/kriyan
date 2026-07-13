import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import {
  AtomicFileStore,
  FilesystemVault,
  KnowledgeIndex,
  SourceRegistry,
  StaleHashError,
  TemporaryMaterializer,
  canonicalJson,
  sha256,
  type EmbeddingProvider,
} from '../src'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })))
})

async function temporary(name: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), name))
  directories.push(path)
  return path
}

test('source registry IDs are stable while raw local data remains at its source', async () => {
  const root = await temporary('kriyan-vault-')
  const sourcePath = join(root, 'outside-vault.md')
  await writeFile(sourcePath, 'Practice Korean every day.\n')
  const vaultRoot = join(root, 'vault')
  const registry = new SourceRegistry(vaultRoot)
  const first = await registry.register({ kind: 'local', displayName: 'Korean notes', location: sourcePath })
  const replay = await registry.register({ kind: 'local', displayName: 'Renamed notes', location: sourcePath })
  expect(replay.sourceRefId).toBe(first.sourceRefId)
  expect(replay.displayName).toBe('Renamed notes')
  expect(await readFile(sourcePath, 'utf8')).toContain('Practice Korean')
  expect(JSON.stringify(await registry.list())).not.toContain('Practice Korean every day')
})

test('temporary materialization cleans success, failure, and stale restart workspaces', async () => {
  const root = await temporary('kriyan-materializer-')
  const sourcePath = join(root, 'source')
  const workspaceRoot = join(root, 'workspaces')
  await mkdir(sourcePath)
  await writeFile(join(sourcePath, 'notes.md'), 'Korean vocabulary')
  const registry = new SourceRegistry(join(root, 'vault'))
  const source = await registry.register({ kind: 'local', displayName: 'Notes', location: sourcePath })
  const materializer = new TemporaryMaterializer(workspaceRoot)
  expect(await materializer.withMaterializedSource(source, async (value) => await readFile(join(value.path, 'notes.md'), 'utf8'))).toContain('Korean')
  expect(await readdir(workspaceRoot)).toEqual([])
  await expect(materializer.withMaterializedSource(source, async () => {
    throw new Error('inspection failed')
  })).rejects.toThrow('inspection failed')
  expect(await readdir(workspaceRoot)).toEqual([])
  await mkdir(join(workspaceRoot, 'abandoned'))
  expect(await materializer.reconcileStaleWorkspaces()).toBe(1)
  expect(await readdir(workspaceRoot)).toEqual([])
})

test('atomic writes reject stale hashes and recover a journaled rename', async () => {
  const root = await temporary('kriyan-atomic-')
  const store = new AtomicFileStore(root)
  const firstHash = await store.write('entities/projects/korean.md', 'first\n', null)
  await expect(store.write('entities/projects/korean.md', 'second\n', 'wrong')).rejects.toBeInstanceOf(StaleHashError)
  expect(await readFile(join(root, 'entities/projects/korean.md'), 'utf8')).toBe('first\n')

  const target = 'entities/projects/recovered.md'
  const temporaryPath = `${target}.pending.tmp`
  const content = 'recovered\n'
  await mkdir(join(root, 'entities/projects'), { recursive: true })
  await mkdir(join(root, '.journal'), { recursive: true })
  await writeFile(join(root, temporaryPath), content)
  await writeFile(join(root, '.journal/recover.json'), `${canonicalJson({
    schemaVersion: 1,
    target,
    temporary: temporaryPath,
    contentHash: sha256(content),
  })}\n`)
  expect(await store.recover()).toBe(1)
  expect(await readFile(join(root, target), 'utf8')).toBe(content)
  expect(await readdir(join(root, '.journal'))).toEqual([])
  expect(firstHash).toBe(sha256('first\n'))
})

test('SQLite rebuild provides lexical and hybrid cited retrieval with offline fallback', async () => {
  const root = await temporary('kriyan-index-')
  const vault = new FilesystemVault(join(root, 'vault'))
  const registry = new SourceRegistry(vault.root)
  const source = await registry.register({ kind: 'local', displayName: 'Study log', location: join(root, 'source') })
  const transcript = await vault.writeTranscript(source, 'sha256:fixture', 'Korean study uses spaced repetition and daily practice.')
  await vault.writeEntity({
    kind: 'project',
    slug: 'korean',
    title: 'Korean',
    summary: 'A language-learning project.',
    tags: ['language'],
    body: 'Build Korean vocabulary through daily practice and spaced repetition.',
    citations: [transcript.citation],
  })
  const embeddings: EmbeddingProvider = {
    name: 'deterministic-test',
    async embed(text) {
      return text.toLowerCase().includes('korean') ? Float32Array.of(1, 0) : Float32Array.of(0, 1)
    },
  }
  const index = new KnowledgeIndex(vault, undefined, embeddings)
  expect(await index.rebuild()).toEqual({ documents: 2, embeddings: 2 })
  const lexical = await index.search('Korean practice')
  expect(lexical.effectiveMode).toBe('lexical')
  expect(lexical.results[0]?.citations[0]).toEqual(transcript.citation)
  const hybrid = await index.search('Korean practice', { mode: 'hybrid' })
  expect(hybrid.effectiveMode).toBe('hybrid')
  expect(hybrid.results.some((result) => result.relativePath === 'entities/projects/korean.md')).toBe(true)
  await vault.resolveCitation(hybrid.results[0]!.citations[0]!)

  const offline = new KnowledgeIndex(vault, undefined, {
    name: 'offline',
    async embed() {
      throw new Error('Ollama unavailable')
    },
  })
  expect((await offline.search('Korean', { mode: 'hybrid' })).effectiveMode).toBe('lexical-fallback')
})
