import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })))
})

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(['bun', 'apps/cli/src/main.ts', ...args], {
    cwd: join(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

test('CLI smoke registers, ingests, searches, and rebuilds from a temporary vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-cli-knowledge-'))
  directories.push(root)
  const source = join(root, 'source')
  const vault = join(root, 'vault')
  await mkdir(source)
  await writeFile(join(source, 'notes.md'), 'Daily Korean Hangul and vocabulary practice.\n')
  const registered = await cli([
    'source', 'register', '--vault', vault, '--kind', 'local', '--location', source, '--name', 'Korean notes',
  ])
  expect(registered.code).toBe(0)
  const sourceRefId = JSON.parse(registered.stdout).source.sourceRefId as string
  const ingested = await cli([
    'ingest', '--vault', vault, '--source-id', sourceRefId, '--entity-kind', 'project', '--entity-slug', 'korean', '--title', 'Korean', '--tags', 'language,study',
  ])
  expect(ingested.code).toBe(0)
  expect(JSON.parse(ingested.stdout).entityPath).toBe('entities/projects/korean.md')
  await rm(source, { recursive: true, force: true })
  const searched = await cli(['search', '--vault', vault, '--query', 'Korean vocabulary'])
  expect(searched.code).toBe(0)
  expect(JSON.parse(searched.stdout).results[0].citations[0].sourceRefId).toBe(sourceRefId)
  const rebuilt = await cli(['index', 'rebuild', '--vault', vault])
  expect(rebuilt.code).toBe(0)
  expect(JSON.parse(rebuilt.stdout)).toMatchObject({ documents: 2, embeddings: 0 })
  const replay = await cli(['search', '--vault', vault, '--query', 'Korean vocabulary'])
  expect(JSON.parse(replay.stdout).results.map((result: { documentId: string }) => result.documentId))
    .toEqual(JSON.parse(searched.stdout).results.map((result: { documentId: string }) => result.documentId))
})
