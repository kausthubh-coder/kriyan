import { cp, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import type { SourceRef } from './types'

export interface MaterializedSource {
  source: SourceRef
  path: string
  sourceVersion: string
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`git command failed: ${stderr.trim() || exitCode}`)
  return stdout.trim()
}

export class TemporaryMaterializer {
  readonly workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = resolve(workspaceRoot)
  }

  async reconcileStaleWorkspaces(): Promise<number> {
    const entries = await readdir(this.workspaceRoot, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.map((entry) => rm(join(this.workspaceRoot, entry.name), { recursive: true, force: true })))
    return entries.length
  }

  async withMaterializedSource<T>(
    source: SourceRef,
    inspect: (materialized: MaterializedSource) => Promise<T>,
  ): Promise<T> {
    await mkdir(this.workspaceRoot, { recursive: true, mode: 0o700 })
    const workspace = join(this.workspaceRoot, `${encodeURIComponent(source.sourceRefId)}-${crypto.randomUUID()}`)
    await mkdir(workspace, { mode: 0o700 })
    await writeFile(join(workspace, '.kriyan-materialization.json'), JSON.stringify({ sourceRefId: source.sourceRefId }), { mode: 0o600 })
    try {
      const materialized = await this.materialize(source, workspace)
      return await inspect(materialized)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }

  private async materialize(source: SourceRef, workspace: string): Promise<MaterializedSource> {
    if (source.kind === 'local') {
      const input = resolve(source.location)
      const info = await stat(input)
      const output = join(workspace, 'source')
      if (info.isDirectory()) await cp(input, output, { recursive: true })
      else {
        await mkdir(output)
        await copyFile(input, join(output, basename(input)))
      }
      return { source, path: output, sourceVersion: source.sourceVersion ?? 'local-working-copy' }
    }
    if (source.kind === 'git' || source.kind === 'github') {
      if (source.sourceVersion === undefined) throw new Error('git and GitHub sources require a pinned source version')
      const output = join(workspace, 'source')
      await runGit(['clone', '--no-checkout', '--quiet', source.location, output])
      await runGit(['checkout', '--detach', '--quiet', source.sourceVersion], output)
      const resolvedVersion = await runGit(['rev-parse', 'HEAD'], output)
      return { source, path: output, sourceVersion: resolvedVersion }
    }
    const response = await fetch(source.location.replace(/^drive:/, 'https://drive.google.com/uc?export=download&id='), {
      redirect: 'follow',
    })
    if (!response.ok) throw new Error(`source fetch failed with HTTP ${response.status}`)
    const output = join(workspace, 'source')
    await mkdir(output)
    await Bun.write(join(output, 'content'), await response.arrayBuffer())
    const sourceVersion = response.headers.get('etag') ?? response.headers.get('last-modified') ?? source.sourceVersion ?? 'unversioned'
    return { source, path: output, sourceVersion }
  }
}
