import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const SOURCE_COMMIT = /^[0-9a-f]{40}$/

export async function resolveReleaseIdentity(
  executablePath = process.execPath,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const manifest = join(dirname(dirname(resolve(executablePath))), 'provenance', 'build.manifest')
  let raw: string
  try {
    raw = await readFile(manifest, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (environment.KRIYAN_RELEASE_VERSION !== undefined) {
      throw new Error('release provenance is missing for KRIYAN_RELEASE_VERSION')
    }
    return 'development'
  }

  const commits = raw
    .split('\n')
    .filter((line) => line.startsWith('source_commit='))
    .map((line) => line.slice('source_commit='.length))
  if (commits.length !== 1 || !SOURCE_COMMIT.test(commits[0]!)) {
    throw new Error('adjacent release provenance has an invalid source_commit')
  }
  const sourceCommit = commits[0]!
  const configured = environment.KRIYAN_RELEASE_VERSION
  if (configured !== undefined && configured !== sourceCommit) {
    throw new Error('release environment identity does not match adjacent provenance')
  }
  return sourceCommit
}
