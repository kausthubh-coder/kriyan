import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { resolveReleaseIdentity } from '../src/release-identity'

const COMMIT = '1234567890abcdef1234567890abcdef12345678'

test('runtime release identity derives from adjacent provenance and validates release.env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-release-identity-'))
  try {
    const executable = join(root, 'release', 'bin', 'kriyan-node')
    await mkdir(join(root, 'release', 'bin'), { recursive: true })
    await mkdir(join(root, 'release', 'provenance'))
    await writeFile(executable, '')
    await writeFile(
      join(root, 'release', 'provenance', 'build.manifest'),
      `manifest_version=1\nsource_commit=${COMMIT}\n`,
    )

    await expect(resolveReleaseIdentity(executable, {})).resolves.toBe(COMMIT)
    await expect(resolveReleaseIdentity(executable, { KRIYAN_RELEASE_VERSION: COMMIT })).resolves.toBe(COMMIT)
    await expect(resolveReleaseIdentity(executable, {
      KRIYAN_RELEASE_VERSION: '0'.repeat(40),
    })).rejects.toThrow('does not match adjacent provenance')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime refuses an environment release identity without adjacent provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-release-identity-missing-'))
  try {
    const executable = join(root, 'release', 'bin', 'kriyan-node')
    await mkdir(join(root, 'release', 'bin'), { recursive: true })
    await writeFile(executable, '')
    await expect(resolveReleaseIdentity(executable, {
      KRIYAN_RELEASE_VERSION: COMMIT,
    })).rejects.toThrow('release provenance is missing')
    await expect(resolveReleaseIdentity(executable, {})).resolves.toBe('development')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
