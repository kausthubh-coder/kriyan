import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command)
  expect(result.exitCode).toBe(0)
  return result.stdout.toString().trim()
}

function elfFixture(machine = 0x3e): Uint8Array {
  const elf = new Uint8Array(64)
  elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])
  const view = new DataView(elf.buffer)
  view.setUint16(16, 2, true)
  view.setUint16(18, machine, true)
  view.setUint32(20, 1, true)
  view.setUint16(52, 64, true)
  return elf
}

async function sha256(path: string): Promise<string> {
  return commandOutput(['shasum', '-a', '256', path]).split(/\s+/)[0] ?? ''
}

async function writeProvenance(
  path: string,
  node: string,
  cli: string,
  overrides: Record<string, string> = {},
): Promise<void> {
  const commit = commandOutput(['git', 'rev-parse', 'HEAD'])
  const values: Record<string, string> = {
    manifest_version: '1',
    source_commit: commit,
    source_tree: commandOutput(['git', 'rev-parse', `${commit}^{tree}`]),
    source_date_epoch: commandOutput(['git', 'show', '-s', '--format=%ct', commit]),
    bun_version: Bun.version,
    target: 'bun-linux-x64-baseline',
    lock_sha256: await sha256('bun.lock'),
    node_sha256: await sha256(node),
    cli_sha256: await sha256(cli),
    source_method: 'git-archive-file',
    bundle_entry: 'node.bundle.normalized.js,cli.bundle.normalized.js',
    normalized_build_prefix: '/opt/kriyan/build',
    ...overrides,
  }
  await writeFile(path, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`)
}

async function normalizeTreeMtime(root: string, epoch: number): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) await normalizeTreeMtime(path, epoch)
    await utimes(path, new Date(epoch * 1000), new Date(epoch * 1000))
  }
  await utimes(root, new Date(epoch * 1000), new Date(epoch * 1000))
}

async function replaceManifestValue(path: string, key: string, value: string): Promise<void> {
  const source = await readFile(path, 'utf8')
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  expect(pattern.test(source)).toBe(true)
  await writeFile(path, source.replace(pattern, `${key}=${value}`))
}

function canonicalArchive(source: string, output: string, epoch: string, options = ''): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([
    'bash', '-c',
    `set -euo pipefail
source=$1
output=$2
epoch=$3
options=$4
raw="$output.tar"
list="$output.list"
trap 'rm -f "$raw" "$list"' EXIT
(
  cd "$source"
  {
    find . -type f -print0
    while IFS= read -r -d '' directory; do printf '%s/\\0' "$directory"; done < <(find . -type d ! -name . -print0)
  } | LC_ALL=C sort -z ${options === 'reverse' ? '-r' : ''} >"$list"
  tar -cf "$raw" --format ustar --uid ${options === 'owner' ? '501' : '0'} --gid ${options === 'owner' ? '20' : '0'} \
    --uname ${options === 'owner' ? 'builder' : 'root'} --gname ${options === 'owner' ? 'staff' : 'root'} \
    --no-recursion --null --no-acls --no-fflags --no-mac-metadata --no-xattrs -T "$list"
)
gzip -n -9 <"$raw" >"$output"`,
    '--', source, output, epoch, options,
  ])
}

test('systemd service is unprivileged, hardened, and drains on SIGTERM', async () => {
  const unit = await readFile('packaging/systemd/kriyan-node.service', 'utf8')
  expect(unit).toContain('User=kriyan')
  expect(unit).toContain('Group=kriyan')
  expect(unit).toContain('NoNewPrivileges=true')
  expect(unit).toContain('ProtectSystem=strict')
  expect(unit).toContain('ProtectKernelTunables=true')
  expect(unit).toContain('RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6')
  expect(unit).toContain('KillSignal=SIGTERM')
  expect(unit).toContain('TimeoutStopSec=45s')
  expect(unit).not.toContain('User=root')
  expect(unit).toContain('ExecStart=/opt/kriyan/current/bin/kriyan-node')
})

test('packaging scripts wire provenance and health transaction primitives', async () => {
  const install = await readFile('packaging/scripts/install.sh', 'utf8')
  const installTransaction = await readFile('packaging/scripts/install-transaction.sh', 'utf8')
  const update = await readFile('packaging/scripts/update.sh', 'utf8')
  const lifecycle = await readFile('packaging/scripts/lifecycle-lib.sh', 'utf8')
  const health = await readFile('packaging/scripts/wait-for-health.sh', 'utf8')
  expect(install).toContain('.partial.$$')
  expect(install).toContain("trap 'rm -rf")
  expect(install).toContain('release identifier already exists with different provenance')
  expect(install).toContain('release ${version} already verified; current pointer refreshed')
  expect(install).toContain('verify-release-archive.sh" "${archive}" "${version}"')
  expect(install).toContain('activate_release_state')
  expect(install).not.toContain('rm -rf "${release_dir}"')
  expect(installTransaction).toContain('KRIYAN_INSTALL_LOCK')
  expect(installTransaction).toContain('snapshot_regular_file "${config}"')
  expect(installTransaction).toContain('snapshot_path "${command_link}"')
  expect(installTransaction).toContain('snapshot_path "${current}"')
  expect(installTransaction).toContain('mv -f "${config}.partial.$$" "${config}"')
  expect(installTransaction).toContain('"${systemctl_cmd}" restart kriyan-node')
  expect(installTransaction).toContain('install transaction recovery failed')
  expect(update).toContain('previous=$(readlink -f')
  expect(update).toContain('snapshot_release_state')
  expect(update).toContain('restore_release_state')
  expect(lifecycle).toContain('validate_provenance_manifest')
  expect(lifecycle).toContain('kriyan-node.service')
  expect(lifecycle).toContain('daemon-reload')
  expect(lifecycle).toContain('wait_for_release_health')
  expect(health).toContain('--health-config')
  expect(health).toContain('--expected-release')
  expect(health).toContain('--not-instance')
  expect(health).toContain('--heartbeat-after')
  expect(health).toContain('--stability-ms')
  expect(update).toContain('complete previous release state restored and healthy')
})

test('release construction binds provenance, rescans ELFs, and emits canonical deterministic archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kriyan-release-'))
  try {
    const node = join(directory, 'node.elf')
    const cli = join(directory, 'cli.elf')
    const manifest = join(directory, 'provenance.manifest')
    await writeFile(node, elfFixture())
    await writeFile(cli, elfFixture())
    await chmod(node, 0o755)
    await chmod(cli, 0o755)
    await writeProvenance(manifest, node, cli)

    const commit = commandOutput(['git', 'rev-parse', 'HEAD'])
    const tree = commandOutput(['git', 'rev-parse', `${commit}^{tree}`])
    const epoch = commandOutput(['git', 'show', '-s', '--format=%ct', commit])
    const first = join(directory, 'first.tar.gz')
    const second = join(directory, 'second.tar.gz')
    for (const archive of [first, second]) {
      const built = Bun.spawnSync([
        'bash', 'packaging/scripts/build-release.sh', archive, node, cli, commit, manifest,
      ])
      expect(built.exitCode, built.stderr.toString()).toBe(0)
      expect(Bun.spawnSync([
        'bash', 'packaging/scripts/verify-release-archive.sh', archive, commit, tree,
      ]).exitCode).toBe(0)
    }
    expect(await readFile(first)).toEqual(await readFile(second))
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-release-archive.sh', first, '0'.repeat(40), tree,
    ]).exitCode).not.toBe(0)

    for (const [name, overrides] of [
      ['wrong-commit', { source_commit: '0'.repeat(40) }],
      ['wrong-tree', { source_tree: '1'.repeat(40) }],
      ['wrong-node-hash', { node_sha256: '2'.repeat(64) }],
    ] as const) {
      const badManifest = join(directory, `${name}.manifest`)
      await writeProvenance(badManifest, node, cli, overrides)
      expect(Bun.spawnSync([
        'bash', 'packaging/scripts/verify-build-inputs.sh', node, cli, commit, badManifest,
      ]).exitCode).not.toBe(0)
    }
    const duplicated = join(directory, 'duplicated.manifest')
    await writeProvenance(duplicated, node, cli)
    await Bun.write(duplicated, `${await readFile(duplicated, 'utf8')}source_commit=${commit}\n`)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-build-inputs.sh', node, cli, commit, duplicated,
    ]).exitCode).not.toBe(0)

    const arbitrary = join(directory, 'arbitrary-executable')
    await writeFile(arbitrary, '#!/bin/sh\nexit 0\n')
    await chmod(arbitrary, 0o755)
    await writeProvenance(join(directory, 'arbitrary.manifest'), arbitrary, cli)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-build-inputs.sh', arbitrary, cli, commit,
      join(directory, 'arbitrary.manifest'),
    ]).exitCode).not.toBe(0)
    const arm = join(directory, 'arm.elf')
    await writeFile(arm, elfFixture(0xb7))
    await chmod(arm, 0o755)
    await writeProvenance(join(directory, 'arm.manifest'), arm, cli)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-build-inputs.sh', arm, cli, commit,
      join(directory, 'arm.manifest'),
    ]).exitCode).not.toBe(0)

    const leaking = join(directory, 'leaking.elf')
    await writeFile(leaking, Buffer.concat([
      Buffer.from(elfFixture()),
      Buffer.from('/private/var/folders/builder/kriyan-isolated-source.realpath'),
    ]))
    await chmod(leaking, 0o755)
    const leakingManifest = join(directory, 'leaking.manifest')
    await writeProvenance(leakingManifest, node, leaking)
    const leakedArchive = Bun.spawnSync([
      'bash', 'packaging/scripts/build-release.sh', join(directory, 'leaked.tar.gz'),
      node, leaking, commit, leakingManifest,
    ])
    expect(leakedArchive.exitCode).not.toBe(0)
    expect(leakedArchive.stderr.toString()).toContain('private user, worktree, or build-temporary path')

    const extracted = join(directory, 'extracted')
    await mkdir(extracted)
    expect(Bun.spawnSync(['tar', '-xzf', first, '-C', extracted]).exitCode).toBe(0)
    const forgedArchives = new Map<string, string>()
    for (const name of ['lock', 'epoch', 'tree', 'bun'] as const) {
      const forged = join(directory, `forged-${name}`)
      await cp(extracted, forged, { recursive: true })
      const forgedManifest = join(forged, 'provenance', 'build.manifest')
      let forgedEpoch = Number(epoch)
      if (name === 'lock') {
        await writeFile(join(forged, 'bun.lock'), `${await readFile(join(forged, 'bun.lock'), 'utf8')}\n# forged\n`)
        await replaceManifestValue(
          forgedManifest,
          'lock_sha256',
          await sha256(join(forged, 'bun.lock')),
        )
      } else if (name === 'epoch') {
        forgedEpoch += 1
        await replaceManifestValue(forgedManifest, 'source_date_epoch', String(forgedEpoch))
      } else if (name === 'tree') {
        await replaceManifestValue(forgedManifest, 'source_tree', '1'.repeat(40))
        await replaceManifestValue(
          join(forged, 'provenance', 'source.manifest'),
          'source_tree',
          '1'.repeat(40),
        )
      } else {
        await replaceManifestValue(forgedManifest, 'bun_version', '9.9.9')
      }
      await normalizeTreeMtime(forged, forgedEpoch)
      const forgedArchive = join(directory, `forged-${name}.tar.gz`)
      expect(canonicalArchive(forged, forgedArchive, String(forgedEpoch)).exitCode).toBe(0)
      forgedArchives.set(name, forgedArchive)
      const rejected = Bun.spawnSync([
        'bash', 'packaging/scripts/verify-release-archive.sh', forgedArchive, commit, tree,
      ])
      expect(
        rejected.exitCode,
        `${name}: ${rejected.stdout.toString()}\n${rejected.stderr.toString()}`,
      ).not.toBe(0)
    }
    const callerWrongTree = Bun.spawnSync([
      'bash', 'packaging/scripts/verify-release-archive.sh', first, commit, '2'.repeat(40),
    ])
    expect(callerWrongTree.exitCode).not.toBe(0)
    expect(callerWrongTree.stderr.toString()).toContain('caller-supplied tree')
    let policylessCommit = commandOutput(['git', 'rev-parse', `${commit}^`])
    while (
      Bun.spawnSync(['git', 'cat-file', '-e', `${policylessCommit}:.bun-version`]).exitCode === 0
    ) {
      policylessCommit = commandOutput(['git', 'rev-parse', `${policylessCommit}^`])
    }
    const policyless = Bun.spawnSync([
      'bash', 'packaging/scripts/verify-release-archive.sh', first, policylessCommit,
    ])
    expect(policyless.exitCode).not.toBe(0)
    expect(policyless.stderr.toString()).toContain('missing .bun-version')

    const operator = join(directory, 'trusted-operator')
    const lockHash = await sha256('bun.lock')
    const operatorBuild = Bun.spawnSync([
      process.execPath,
      'build',
      '--compile',
      '--target=bun-darwin-arm64',
      '--no-compile-autoload-dotenv',
      '--define', `KRIYAN_TRUSTED_SOURCE_COMMIT="${commit}"`,
      '--define', `KRIYAN_TRUSTED_SOURCE_TREE="${tree}"`,
      '--define', `KRIYAN_TRUSTED_SOURCE_EPOCH="${epoch}"`,
      '--define', `KRIYAN_TRUSTED_LOCK_SHA256="${lockHash}"`,
      '--define', `KRIYAN_TRUSTED_BUN_VERSION="${Bun.version}"`,
      join(process.cwd(), 'apps', 'cli', 'src', 'main.ts'),
      '--outfile', operator,
    ], { cwd: directory })
    expect(operatorBuild.exitCode, operatorBuild.stderr.toString()).toBe(0)
    const outside = join(directory, 'outside-checkout')
    const fakeTools = join(outside, 'bin')
    await mkdir(fakeTools, { recursive: true })
    await writeFile(join(fakeTools, 'scp'), '#!/usr/bin/env bash\nexit 0\n')
    await chmod(join(fakeTools, 'scp'), 0o755)
    await writeFile(join(fakeTools, 'ssh'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${join(outside, 'ssh.log')}"
if [[ $* == *"/usr/local/bin/kriyan"*"doctor"* ]]; then
  printf '%s\n' '{"ok":true,"command":"vps doctor","service":{"enabled":true,"active":true},"doctor":{"config":"pass","processHealth":"pass","releaseIdentity":"pass"}}'
fi
`)
    await chmod(join(fakeTools, 'ssh'), 0o755)
    const knownHosts = join(outside, 'known-hosts')
    const config = join(outside, 'node.json')
    const poisonedIdentity = join(outside, 'poisoned-identity')
    await writeFile(knownHosts, '')
    await writeFile(poisonedIdentity, 'source_commit=poisoned\nsource_commit=duplicate\n')
    await writeFile(config, JSON.stringify({
      convexUrl: 'https://example.convex.cloud',
      installationId: 'installation:bare-host',
      nodeId: 'node:bare-host',
      displayName: 'Bare host',
      protocolVersion: '1',
      dataDir: '/var/lib/kriyan/node',
      timezone: 'UTC',
      locale: 'en-US',
      runtime: 'fake',
    }))
    const operatorEnvironment = {
      ...process.env,
      PATH: `${fakeTools}:${process.env.PATH ?? ''}`,
      KRIYAN_TRUSTED_IDENTITY_FILE: poisonedIdentity,
    }
    const validOperatorInstall = Bun.spawnSync([
      operator, 'vps', 'install',
      '--host', '203.0.113.10', '--user', 'ubuntu',
      '--known-hosts', knownHosts, '--host-key-policy', 'strict',
      '--release', first, '--checksum', `${first}.sha256`,
      '--version', commit, '--config', config,
    ], { cwd: outside, env: operatorEnvironment })
    expect(
      validOperatorInstall.exitCode,
      `${validOperatorInstall.stdout.toString()}\n${validOperatorInstall.stderr.toString()}`,
    ).toBe(0)
    const forgedLock = forgedArchives.get('lock')!
    const forgedChecksum = `${forgedLock}.sha256`
    await writeFile(forgedChecksum, `${await sha256(forgedLock)}  ${forgedLock.split('/').at(-1)}\n`)
    const forgedOperatorUpdate = Bun.spawnSync([
      operator, 'vps', 'update',
      '--host', '203.0.113.10', '--user', 'ubuntu',
      '--known-hosts', knownHosts, '--host-key-policy', 'strict',
      '--release', forgedLock, '--checksum', forgedChecksum, '--version', commit,
    ], { cwd: outside, env: operatorEnvironment })
    expect(forgedOperatorUpdate.exitCode).not.toBe(0)
    for (const variant of ['owner', 'reverse'] as const) {
      const archive = join(directory, `${variant}.tar.gz`)
      expect(canonicalArchive(extracted, archive, epoch, variant).exitCode).toBe(0)
      expect(Bun.spawnSync([
        'perl', 'packaging/scripts/verify-canonical-archive.pl', archive, epoch,
      ]).exitCode).not.toBe(0)
    }
    const packagedCli = join(extracted, 'bin', 'kriyan')
    await utimes(packagedCli, new Date((Number(epoch) + 1) * 1000), new Date((Number(epoch) + 1) * 1000))
    const badMtime = join(directory, 'mtime.tar.gz')
    expect(canonicalArchive(extracted, badMtime, epoch).exitCode).toBe(0)
    expect(Bun.spawnSync([
      'perl', 'packaging/scripts/verify-canonical-archive.pl', badMtime, epoch,
    ]).exitCode).not.toBe(0)
    await utimes(packagedCli, new Date(Number(epoch) * 1000), new Date(Number(epoch) * 1000))

    await writeFile(packagedCli, Buffer.concat([await readFile(packagedCli), Buffer.from('safe-hash-change')]))
    await utimes(packagedCli, new Date(Number(epoch) * 1000), new Date(Number(epoch) * 1000))
    expect(await sha256(packagedCli)).not.toBe(await sha256(cli))
    const changedHash = join(directory, 'changed-hash.tar.gz')
    expect(canonicalArchive(extracted, changedHash, epoch).exitCode).toBe(0)
    const archivedCli = Bun.spawnSync(['tar', '-xOzf', changedHash, './bin/kriyan'])
    expect(archivedCli.exitCode).toBe(0)
    expect(new Bun.CryptoHasher('sha256').update(archivedCli.stdout).digest('hex')).toBe(await sha256(packagedCli))
    const changedHashResult = Bun.spawnSync([
      'bash', 'packaging/scripts/verify-release-archive.sh', changedHash, commit, tree,
    ])
    expect(
      changedHashResult.exitCode,
      `${changedHashResult.stdout.toString()}\n${changedHashResult.stderr.toString()}`,
    ).not.toBe(0)
    expect(changedHashResult.stderr.toString()).toContain('ELF hash does not match provenance manifest')
    await writeFile(packagedCli, await readFile(cli))
    await chmod(packagedCli, 0o755)
    await utimes(packagedCli, new Date(Number(epoch) * 1000), new Date(Number(epoch) * 1000))

    await chmod(join(extracted, 'bin', 'kriyan'), 0o644)
    const badMode = join(directory, 'mode.tar.gz')
    expect(canonicalArchive(extracted, badMode, epoch).exitCode).toBe(0)
    expect(Bun.spawnSync([
      'perl', 'packaging/scripts/verify-canonical-archive.pl', badMode, epoch,
    ]).exitCode).not.toBe(0)
    await chmod(join(extracted, 'bin', 'kriyan'), 0o755)

    const duplicate = join(directory, 'duplicate.tar.gz')
    expect(Bun.spawnSync([
      'tar', '-czf', duplicate, '-C', extracted, 'bin/kriyan', 'bin/kriyan', 'bin/kriyan-node',
    ]).exitCode).toBe(0)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-safe-archive.sh', duplicate,
    ]).exitCode).not.toBe(0)
    await symlink('kriyan-node', join(extracted, 'bin', 'node-link'))
    const linked = join(directory, 'linked.tar.gz')
    expect(Bun.spawnSync([
      'tar', '-czf', linked, '-C', extracted, 'bin/kriyan', 'bin/kriyan-node', 'bin/node-link',
    ]).exitCode).toBe(0)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-safe-archive.sh', linked,
    ]).exitCode).not.toBe(0)
    const traversal = join(directory, 'traversal.tar.gz')
    const transform = process.platform === 'darwin'
      ? ['-s', ',^bin,../bin,']
      : ['--transform=s,^bin,../bin,']
    expect(Bun.spawnSync([
      'tar', '-czf', traversal, ...transform, '-C', extracted, 'bin/kriyan', 'bin/kriyan-node',
    ]).exitCode).toBe(0)
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/verify-safe-archive.sh', traversal,
    ]).exitCode).not.toBe(0)

    for (const marker of [
      '/var/folders/builder/kriyan-source.realpath',
      '/private/var/folders/builder/kriyan-build.realpath',
      '/tmp/kriyan-isolated-source.marker',
      '/private/tmp/kriyan-release-stage.marker',
      '/Users/builder/private',
      '/home/builder/private',
      '/workspace/.codex/worktrees/private',
    ]) {
      const markerFile = join(directory, `marker-${Math.random()}`)
      await writeFile(markerFile, marker)
      expect(Bun.spawnSync([
        'bash', 'packaging/scripts/scan-binary-content.sh', markerFile,
      ]).exitCode).not.toBe(0)
    }
    const secretFile = join(directory, 'secret-marker')
    await writeFile(secretFile, 'known-secret-value-123')
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/scan-binary-content.sh', secretFile,
    ], { env: { ...process.env, KRIYAN_API_KEY: 'known-secret-value-123' } }).exitCode).not.toBe(0)

    const bunToolchainPath = join(directory, 'bun-toolchain-path')
    await writeFile(
      bunToolchainPath,
      '/Users/brew/Library/Caches/Homebrew/cargo_cache/registry/src/crate/lib.rs',
    )
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/scan-binary-content.sh', bunToolchainPath,
    ]).exitCode).toBe(0)

    const scannerTools = join(directory, 'scanner-tools')
    await mkdir(scannerTools)
    await symlink(commandOutput(['which', 'grep']), join(scannerTools, 'grep'))
    expect(Bun.spawnSync([
      '/bin/bash', 'packaging/scripts/scan-binary-content.sh', bunToolchainPath,
    ], { env: { ...process.env, PATH: scannerTools } }).exitCode).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

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
  const isolated = await readFile('packaging/scripts/build-isolated.sh', 'utf8')
  expect(packageJson.scripts['check:convex-metadata']).toBe('bash scripts/check-convex-metadata.sh')
  expect(script).toContain('convex function-spec >"${spec}"')
  expect(script).toContain('assert-convex-function-spec.ts "${spec}"')
  expect(isolated).toContain('git archive --format=tar --output="${source_archive}"')
  expect(isolated).not.toMatch(/git archive[^\n]*\|/)
  expect(isolated).not.toContain('/dev/stdin --outfile')
  expect(isolated).toContain('node.bundle.normalized.js')
  expect(isolated).toContain('normalize_root "${normalized}" "${temporary_root}"')
  expect(isolated).toContain('normalize_root "${normalized}" "${HOME:-}"')
})

test('restore applies install-grade archive checks before extraction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qualified-sandpiper-726-restore-'))
  try {
    const source = join(directory, 'source')
    const target = join(directory, 'target')
    await mkdir(join(source, 'var', 'lib', 'kriyan'), { recursive: true })
    await writeFile(join(source, 'var', 'lib', 'kriyan', 'checkpoint'), 'safe', 'utf8')
    const valid = join(directory, 'backup.tar.gz')
    Bun.spawnSync(['tar', '-czf', valid, '-C', source, 'var'])
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/restore.sh', valid, target,
    ]).exitCode).toBe(0)
    expect(await readFile(join(target, 'var', 'lib', 'kriyan', 'checkpoint'), 'utf8')).toBe('safe')

    const unsafeSource = join(directory, 'unsafe')
    await mkdir(unsafeSource)
    await symlink('/etc/passwd', join(unsafeSource, 'credential-link'))
    const unsafe = join(directory, 'unsafe.tar.gz')
    Bun.spawnSync(['tar', '-czf', unsafe, '-C', unsafeSource, 'credential-link'])
    expect(Bun.spawnSync([
      'bash', 'packaging/scripts/restore.sh', unsafe, join(directory, 'unsafe-target'),
    ]).exitCode).not.toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
