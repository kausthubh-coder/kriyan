import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

test('systemd service is unprivileged, hardened, and drains on SIGTERM', async () => {
  const unit = await readFile('packaging/systemd/kriyan-node.service', 'utf8')
  expect(unit).toContain('User=kriyan')
  expect(unit).toContain('Group=kriyan')
  expect(unit).toContain('NoNewPrivileges=true')
  expect(unit).toContain('ProtectSystem=strict')
  expect(unit).toContain('KillSignal=SIGTERM')
  expect(unit).toContain('TimeoutStopSec=45s')
  expect(unit).not.toContain('User=root')
  expect(unit).toContain('ExecStart=/opt/kriyan/current/bin/kriyan-node')
})

test('install and update paths are interruption-safe and rollback-capable', async () => {
  const install = await readFile('packaging/scripts/install.sh', 'utf8')
  const update = await readFile('packaging/scripts/update.sh', 'utf8')
  expect(install).toContain('.partial.$$')
  expect(install).toContain("trap 'rm -rf")
  expect(install).toContain('immutable releases are never replaced')
  expect(install).toContain('verify-release-archive.sh')
  expect(install).not.toContain('rm -rf "${release_dir}"')
  expect(update).toContain('previous=$(readlink -f')
  expect(update).toContain('--health-config')
  expect(update).toContain('previous release restored')
})

test('release archive verifier rejects traversal, duplicate, and symlink entries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-release-'))
  try {
    const bin = join(directory, 'bin')
    await mkdir(bin, { recursive: true })
    const executable = join(bin, 'kriyan-node')
    await writeFile(executable, '#!/bin/sh\nexit 0\n', 'utf8')
    await chmod(executable, 0o755)
    const cli = join(bin, 'kriyan')
    await writeFile(cli, '#!/bin/sh\nexit 0\n', 'utf8')
    await chmod(cli, 0o755)
    const valid = join(directory, 'valid.tar.gz')
    Bun.spawnSync(['tar', '-czf', valid, '-C', directory, 'bin/kriyan-node', 'bin/kriyan'])
    expect(Bun.spawnSync(['bash', 'packaging/scripts/verify-release-archive.sh', valid]).exitCode).toBe(0)

    const duplicate = join(directory, 'duplicate.tar.gz')
    Bun.spawnSync(['tar', '-czf', duplicate, '-C', directory, 'bin/kriyan-node', 'bin/kriyan-node', 'bin/kriyan'])
    expect(Bun.spawnSync(['bash', 'packaging/scripts/verify-release-archive.sh', duplicate]).exitCode).not.toBe(0)

    const traversal = join(directory, 'traversal.tar.gz')
    const transform = process.platform === 'darwin'
      ? ['-s', ',^bin,../bin,']
      : ['--transform=s,^bin,../bin,']
    const traversalArchive = Bun.spawnSync([
      'tar', '-czf', traversal, ...transform, '-C', directory,
      'bin/kriyan-node', 'bin/kriyan',
    ])
    expect(traversalArchive.exitCode).toBe(0)
    expect(Bun.spawnSync(['bash', 'packaging/scripts/verify-release-archive.sh', traversal]).exitCode).not.toBe(0)

    await symlink('kriyan-node', join(bin, 'node-link'))
    const linked = join(directory, 'linked.tar.gz')
    Bun.spawnSync(['tar', '-czf', linked, '-C', directory, 'bin/kriyan-node', 'bin/kriyan', 'bin/node-link'])
    expect(Bun.spawnSync(['bash', 'packaging/scripts/verify-release-archive.sh', linked]).exitCode).not.toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('release identifiers reject traversal and shell/path metacharacters', async () => {
  const valid = Bun.spawnSync([
    'bash', '-c',
    'source packaging/scripts/release-path.sh; validate_release_version "$1"',
    '--', 'v1.2.3-deadbeef',
  ])
  expect(valid.exitCode).toBe(0)
  for (const version of ['../escape', '..', 'a/b', 'release link', 'x;rm', '']) {
    const result = Bun.spawnSync([
      'bash', '-c',
      'source packaging/scripts/release-path.sh; validate_release_version "$1"',
      '--', version,
    ])
    expect(result.exitCode).not.toBe(0)
  }
})

test('release switching is atomic and refuses a directory or symlinked release root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-install-root-'))
  try {
    const releases = join(directory, 'releases')
    const release = join(releases, 'v1-deadbeef')
    await mkdir(release, { recursive: true })
    const switched = Bun.spawnSync([
      'bash', '-c',
      'source packaging/scripts/release-path.sh; target=$(release_path "$1"); switch_current_release "$target"',
      '--', 'v1-deadbeef',
    ], { env: { ...process.env, KRIYAN_OPT_ROOT: directory } })
    expect(switched.exitCode).toBe(0)
    expect((await lstat(join(directory, 'current'))).isSymbolicLink()).toBe(true)

    await rm(join(directory, 'current'))
    await mkdir(join(directory, 'current'))
    const directoryPointer = Bun.spawnSync([
      'bash', '-c',
      'source packaging/scripts/release-path.sh; target=$(release_path "$1"); switch_current_release "$target"',
      '--', 'v1-deadbeef',
    ], { env: { ...process.env, KRIYAN_OPT_ROOT: directory } })
    expect(directoryPointer.exitCode).not.toBe(0)

    await rm(join(directory, 'current'), { recursive: true })
    await rm(releases, { recursive: true })
    const realReleases = join(directory, 'real-releases')
    await mkdir(realReleases)
    await symlink(realReleases, releases)
    const symlinkRoot = Bun.spawnSync([
      'bash', '-c',
      'source packaging/scripts/release-path.sh; release_path "$1"',
      '--', 'v1-deadbeef',
    ], { env: { ...process.env, KRIYAN_OPT_ROOT: directory } })
    expect(symlinkRoot.exitCode).not.toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('root metadata check generates and passes the required function-spec argument', async () => {
  const packageJson = await Bun.file('package.json').json()
  const script = await readFile('scripts/check-convex-metadata.sh', 'utf8')
  expect(packageJson.scripts['check:convex-metadata']).toBe('bash scripts/check-convex-metadata.sh')
  expect(script).toContain('convex function-spec >"${spec}"')
  expect(script).toContain('assert-convex-function-spec.ts "${spec}"')
})
