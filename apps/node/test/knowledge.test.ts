import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'
import type {
  KnowledgeDocumentProjectionInput,
  KnowledgeProjectionPlane,
  SourceRefProjectionInput,
} from '@kriyan/convex-client'
import type { EmbeddingProvider } from '@kriyan/knowledge-vault'

import { KnowledgeService } from '../src/knowledge'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })))
})

async function git(args: string[], cwd: string): Promise<string> {
  const process = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (code !== 0) throw new Error(stderr)
  return stdout.trim()
}

test('temporary git source reaches a reproducible cited korean entity and compact projections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-knowledge-fixture-'))
  directories.push(root)
  const sourceRoot = join(root, 'source-repository')
  const vaultRoot = join(root, 'vault')
  const workspaceRoot = join(root, 'materializations')
  await mkdir(sourceRoot)
  await git(['init', '--quiet'], sourceRoot)
  await writeFile(join(sourceRoot, 'study.md'), '# Korean study\n\nPractice Hangul and vocabulary with spaced repetition.\n')
  await git(['add', 'study.md'], sourceRoot)
  await git(['-c', 'user.name=Kriyan Test', '-c', 'user.email=test@invalid.example', 'commit', '--quiet', '-m', 'fixture'], sourceRoot)
  const revision = await git(['rev-parse', 'HEAD'], sourceRoot)

  const sources: SourceRefProjectionInput[] = []
  const entities: KnowledgeDocumentProjectionInput[] = []
  const projections: KnowledgeProjectionPlane = {
    async upsertSourceRef(input) {
      sources.push(input)
      return { ok: true, created: true, revision: 0 }
    },
    async upsertKnowledgeDocument(input) {
      entities.push(input)
      return { ok: true, created: true, revision: 0 }
    },
  }
  const embeddings: EmbeddingProvider = {
    name: 'fixture-embedding',
    async embed(text) {
      return text.toLowerCase().includes('korean') ? Float32Array.of(1, 0, 0) : Float32Array.of(0, 1, 0)
    },
  }
  const service = new KnowledgeService({
    vaultRoot,
    workspaceRoot,
    embeddingProvider: embeddings,
    projectionPlane: projections,
    installationId: 'installation:test',
  })
  await service.initialize()
  const source = await service.registerSource({
    kind: 'git',
    displayName: 'Korean study repository',
    location: sourceRoot,
    sourceVersion: revision,
  })
  const ingested = await service.ingest({
    sourceRefId: source.sourceRefId,
    entityKind: 'project',
    entitySlug: 'korean',
    title: 'Korean',
    summary: 'Learn Korean through consistent practice.',
    tags: ['language', 'study'],
  })
  expect(ingested.entityPath).toBe('entities/projects/korean.md')
  expect(await readFile(join(vaultRoot, ingested.entityPath), 'utf8')).toContain('spaced repetition')
  expect(await readdir(workspaceRoot)).toEqual([])
  const lexical = await service.search('Hangul vocabulary', 'lexical')
  const hybrid = await service.search('Korean practice', 'hybrid')
  expect(lexical.results[0]?.citations[0]?.sourceVersion).toBe(revision)
  expect(hybrid.effectiveMode).toBe('hybrid')
  expect(hybrid.results.some((result) => result.relativePath === 'entities/projects/korean.md')).toBe(true)
  expect(sources).toHaveLength(1)
  expect(entities).toHaveLength(1)
  expect(JSON.stringify({ sources, entities })).not.toContain('Practice Hangul')
  expect(Object.keys(entities[0]!)).not.toContain('embedding')

  await rm(sourceRoot, { recursive: true, force: true })
  const restarted = new KnowledgeService({ vaultRoot, workspaceRoot, embeddingProvider: embeddings })
  expect(await restarted.initialize()).toEqual({ recoveredWrites: 0, staleWorkspacesRemoved: 0 })
  const before = (await restarted.search('Korean practice', 'hybrid')).results.map((result) => result.documentId)
  await rm(join(vaultRoot, '.index'), { recursive: true, force: true })
  expect(await restarted.rebuildIndex()).toEqual({ documents: 2, embeddings: 2 })
  const after = (await restarted.search('Korean practice', 'hybrid')).results.map((result) => result.documentId)
  expect(after).toEqual(before)
})
