import { chmod, mkdir, mkdtemp, readFile, readlink, realpath, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

const OLD_SHA = '1111111111111111111111111111111111111111'
const NEW_SHA = '2222222222222222222222222222222222222222'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function elfFixture(): Uint8Array {
  const elf = new Uint8Array(64)
  elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])
  const view = new DataView(elf.buffer)
  view.setUint16(16, 2, true)
  view.setUint16(18, 0x3e, true)
  view.setUint32(20, 1, true)
  view.setUint16(52, 64, true)
  return elf
}

function hash(value: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}

async function executable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents)
  await chmod(path, 0o755)
}

async function release(root: string, sha: string): Promise<string> {
  const path = join(root, 'opt', 'releases', sha)
  const binary = elfFixture()
  await mkdir(join(path, 'bin'), { recursive: true })
  await mkdir(join(path, 'provenance'))
  await mkdir(join(path, 'packaging', 'systemd'), { recursive: true })
  await writeFile(join(path, 'bin', 'kriyan-node'), binary)
  await writeFile(join(path, 'bin', 'kriyan'), binary)
  await chmod(join(path, 'bin', 'kriyan-node'), 0o755)
  await chmod(join(path, 'bin', 'kriyan'), 0o755)
  await writeFile(join(path, 'packaging', 'systemd', 'kriyan-node.service'), `unit-${sha}\n`)
  await writeFile(join(path, 'provenance', 'build.manifest'), [
    'manifest_version=1',
    `source_commit=${sha}`,
    `source_tree=${'a'.repeat(40)}`,
    'source_date_epoch=1',
    `bun_version=${Bun.version}`,
    'target=bun-linux-x64-baseline',
    `lock_sha256=${'b'.repeat(64)}`,
    `node_sha256=${hash(binary)}`,
    `cli_sha256=${hash(binary)}`,
    'source_method=git-archive-file',
    'bundle_entry=node.bundle.normalized.js,cli.bundle.normalized.js',
    'normalized_build_prefix=/opt/kriyan/build',
    '',
  ].join('\n'))
  return path
}

interface LifecycleFixture {
  root: string
  oldRelease: string
  newRelease: string
  env: Record<string, string>
  systemctlLog: string
  healthLog: string
  oldEnvironment: string
  oldUnit: string
}

async function lifecycleFixture(failure: 'daemon-reload' | 'restart' | 'health' | 'none'): Promise<LifecycleFixture> {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-lifecycle-'))
  roots.push(root)
  const oldRelease = await release(root, OLD_SHA)
  const newRelease = await release(root, NEW_SHA)
  const etcRoot = join(root, 'etc')
  const systemdRoot = join(root, 'systemd')
  const fakeRoot = join(root, 'fake')
  await mkdir(etcRoot)
  await mkdir(systemdRoot)
  await mkdir(fakeRoot)
  await symlink(oldRelease, join(root, 'opt', 'current'))
  const oldEnvironment = `KRIYAN_RELEASE_VERSION=${OLD_SHA}\nKRIYAN_TEST_SENTINEL=preserve\n`
  const oldUnit = `unit-${OLD_SHA}\n`
  await writeFile(join(etcRoot, 'release.env'), oldEnvironment)
  await writeFile(join(etcRoot, 'node.json'), '{}\n')
  await writeFile(join(systemdRoot, 'kriyan-node.service'), oldUnit)
  const systemctlLog = join(root, 'systemctl.log')
  const healthLog = join(root, 'health.log')
  const fakeSystemctl = join(fakeRoot, 'systemctl')
  await executable(fakeSystemctl, `#!/usr/bin/env bash
set -euo pipefail
command=$1
current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
printf '%s %s\n' "$command" "$current" >>"$KRIYAN_SYSTEMCTL_LOG"
if [[ $current == "$KRIYAN_TARGET_RELEASE" && $command == "$KRIYAN_FAILURE_STAGE" ]]; then
  exit 1
fi
case $command in
  is-active|is-enabled) exit 0 ;;
  daemon-reload|restart|enable|disable) exit 0 ;;
  *) exit 0 ;;
esac
`)
  const waitForHealth = join(fakeRoot, 'wait-for-health')
  await executable(waitForHealth, `#!/usr/bin/env bash
set -euo pipefail
expected=$3
printf '%s\n' "$expected" >>"$KRIYAN_HEALTH_LOG"
current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
[[ $current == "$expected" ]]
grep -q "^KRIYAN_RELEASE_VERSION=$expected$" "$KRIYAN_ETC_ROOT/release.env"
grep -q "^unit-$expected$" "$KRIYAN_SYSTEMD_ROOT/kriyan-node.service"
if [[ $expected == "$KRIYAN_TARGET_RELEASE" && $KRIYAN_FAILURE_STAGE == health ]]; then
  exit 1
fi
`)
  const processHealth = join(fakeRoot, 'process-health')
  await executable(processHealth, `#!/usr/bin/env bash
set -euo pipefail
printf 'instance-%s\t%s\t1\n' "$(basename "$1")" "$(basename "$1")"
`)
  const install = join(fakeRoot, 'install-release')
  await executable(install, `#!/usr/bin/env bash
set -euo pipefail
source "$KRIYAN_LIFECYCLE_LIB"
activate_release_state "$KRIYAN_UPDATE_TARGET" "$KRIYAN_VERSION"
`)
  const validateRelease = join(fakeRoot, 'validate-release')
  await executable(validateRelease, '#!/usr/bin/env bash\nexit 0\n')
  return {
    root,
    oldRelease,
    newRelease,
    systemctlLog,
    healthLog,
    oldEnvironment,
    oldUnit,
    env: {
      ...process.env,
      KRIYAN_OPT_ROOT: join(root, 'opt'),
      KRIYAN_ETC_ROOT: etcRoot,
      KRIYAN_STATE_ROOT: join(root, 'state'),
      KRIYAN_SYSTEMD_ROOT: systemdRoot,
      KRIYAN_BIN_ROOT: join(root, 'bin'),
      KRIYAN_SYSTEMCTL: fakeSystemctl,
      KRIYAN_SYSTEMCTL_LOG: systemctlLog,
      KRIYAN_HEALTH_LOG: healthLog,
      KRIYAN_WAIT_FOR_HEALTH: waitForHealth,
      KRIYAN_PROCESS_HEALTH_READER: processHealth,
      KRIYAN_VALIDATE_INSTALLED_RELEASE: validateRelease,
      KRIYAN_RELEASE_ENV_OWNER: '',
      KRIYAN_LIFECYCLE_LIB: join(process.cwd(), 'packaging', 'scripts', 'lifecycle-lib.sh'),
      KRIYAN_INSTALL_SCRIPT: install,
      KRIYAN_UPDATE_TARGET: await realpath(newRelease),
      KRIYAN_TARGET_RELEASE: NEW_SHA,
      KRIYAN_FAILURE_STAGE: failure,
      KRIYAN_VERSION: NEW_SHA,
    },
  }
}

async function expectPreviousStateRestored(item: LifecycleFixture): Promise<void> {
  expect(await realpath(join(item.root, 'opt', 'current'))).toBe(await realpath(item.oldRelease))
  expect(await readFile(join(item.root, 'etc', 'release.env'), 'utf8')).toBe(item.oldEnvironment)
  expect(await readFile(join(item.root, 'systemd', 'kriyan-node.service'), 'utf8')).toBe(item.oldUnit)
  expect((await readFile(item.systemctlLog, 'utf8')).trim().split('\n').slice(-2)).toEqual([
    `restart ${OLD_SHA}`,
    `is-active ${OLD_SHA}`,
  ])
  expect((await readFile(item.healthLog, 'utf8')).trim().split('\n').at(-1)).toBe(OLD_SHA)
}

async function expectFailureStageReached(
  item: LifecycleFixture,
  failure: 'daemon-reload' | 'restart' | 'health',
): Promise<void> {
  if (failure === 'health') {
    expect((await readFile(item.healthLog, 'utf8')).trim().split('\n')).toContain(NEW_SHA)
  } else {
    expect((await readFile(item.systemctlLog, 'utf8')).trim().split('\n')).toContain(
      `${failure} ${NEW_SHA}`,
    )
  }
}

test('current pointer replacement is atomic and leaves no nested temporary link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-pointer-'))
  roots.push(root)
  const oldRelease = join(root, 'opt', 'releases', OLD_SHA)
  const newRelease = join(root, 'opt', 'releases', NEW_SHA)
  await mkdir(oldRelease, { recursive: true })
  await mkdir(newRelease)
  await symlink(oldRelease, join(root, 'opt', 'current'))
  const canonicalNewRelease = await realpath(newRelease)
  const result = Bun.spawnSync([
    'bash', '-c', 'source packaging/scripts/release-path.sh; switch_current_release "$1"', '--', canonicalNewRelease,
  ], { env: { ...process.env, KRIYAN_OPT_ROOT: join(root, 'opt') } })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(await realpath(join(root, 'opt', 'current'))).toBe(canonicalNewRelease)
  expect(await Array.fromAsync(new Bun.Glob('**/.current.*').scan({ cwd: root, onlyFiles: false }))).toEqual([])
})

for (const failure of ['daemon-reload', 'restart', 'health'] as const) {
  test(`update restores pointer, env, unit, daemon state, and prior health after ${failure} failure`, async () => {
    const item = await lifecycleFixture(failure)
    const result = Bun.spawnSync([
      'bash', 'packaging/scripts/update.sh', join(item.root, 'release.tar.gz'),
    ], { env: item.env })
    expect(result.exitCode).toBe(1)
    await expectFailureStageReached(item, failure)
    await expectPreviousStateRestored(item)
  })

  test(`rollback restores pointer, env, unit, daemon state, and prior health after ${failure} failure`, async () => {
    const item = await lifecycleFixture(failure)
    const result = Bun.spawnSync([
      'bash', 'packaging/scripts/rollback.sh', NEW_SHA,
    ], { env: item.env })
    expect(result.exitCode).toBe(1)
    await expectFailureStageReached(item, failure)
    await expectPreviousStateRestored(item)
  })
}

test('update and rollback complete healthy release transitions', async () => {
  const item = await lifecycleFixture('none')
  const update = Bun.spawnSync([
    'bash', 'packaging/scripts/update.sh', join(item.root, 'release.tar.gz'),
  ], { env: item.env })
  expect(update.exitCode, update.stderr.toString()).toBe(0)
  expect(await realpath(join(item.root, 'opt', 'current'))).toBe(await realpath(item.newRelease))
  expect(await readFile(join(item.root, 'etc', 'release.env'), 'utf8')).toBe(
    `KRIYAN_RELEASE_VERSION=${NEW_SHA}\n`,
  )
  expect(await readFile(join(item.root, 'systemd', 'kriyan-node.service'), 'utf8')).toBe(
    `unit-${NEW_SHA}\n`,
  )

  const rollback = Bun.spawnSync([
    'bash', 'packaging/scripts/rollback.sh', OLD_SHA,
  ], { env: item.env })
  expect(rollback.exitCode, rollback.stderr.toString()).toBe(0)
  expect(await realpath(join(item.root, 'opt', 'current'))).toBe(await realpath(item.oldRelease))
  expect((await readFile(item.healthLog, 'utf8')).trim().split('\n').at(-1)).toBe(OLD_SHA)
})

test('repeat install executes archive verification and refreshes one immutable release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-repeat-install-'))
  roots.push(root)
  const commit = Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim()
  const tree = Bun.spawnSync(['git', 'rev-parse', `${commit}^{tree}`]).stdout.toString().trim()
  const epoch = Bun.spawnSync(['git', 'show', '-s', '--format=%ct', commit]).stdout.toString().trim()
  const sourceRelease = await release(root, commit)
  const binary = await readFile(join(sourceRelease, 'bin', 'kriyan-node'))
  await writeFile(join(sourceRelease, 'provenance', 'build.manifest'), [
    'manifest_version=1',
    `source_commit=${commit}`,
    `source_tree=${tree}`,
    `source_date_epoch=${epoch}`,
    `bun_version=${Bun.version}`,
    'target=bun-linux-x64-baseline',
    `lock_sha256=${hash(await readFile('bun.lock'))}`,
    `node_sha256=${hash(binary)}`,
    `cli_sha256=${hash(binary)}`,
    'source_method=git-archive-file',
    'bundle_entry=node.bundle.normalized.js,cli.bundle.normalized.js',
    'normalized_build_prefix=/opt/kriyan/build',
    '',
  ].join('\n'))
  const archive = join(root, 'release.tar.gz')
  const built = Bun.spawnSync([
    'bash', 'packaging/scripts/build-release.sh', archive,
    join(sourceRelease, 'bin', 'kriyan-node'), join(sourceRelease, 'bin', 'kriyan'),
    commit, join(sourceRelease, 'provenance', 'build.manifest'),
  ])
  expect(built.exitCode, built.stderr.toString()).toBe(0)

  for (const directory of ['installed-opt', 'installed-etc', 'installed-state', 'installed-systemd', 'fake']) {
    await mkdir(join(root, directory))
  }
  const fakeInstall = join(root, 'fake', 'install')
  await executable(fakeInstall, `#!/usr/bin/env bash
set -euo pipefail
arguments=()
while (($#)); do
  case $1 in
    -o|-g) shift 2 ;;
    *) arguments+=("$1"); shift ;;
  esac
done
exec /usr/bin/install "${'${arguments[@]}'}"
`)
  await executable(join(root, 'fake', 'id'), '#!/usr/bin/env bash\nexit 0\n')
  const systemctl = join(root, 'fake', 'systemctl')
  await executable(systemctl, '#!/usr/bin/env bash\nexit 0\n')
  const harness = join(root, 'install-harness')
  await executable(harness, `#!/usr/bin/env bash
set -euo pipefail
source "$1"
shift
install_main 0 "$@"
`)
  const env = {
    ...process.env,
    PATH: `${join(root, 'fake')}:${process.env.PATH ?? ''}`,
    KRIYAN_OPT_ROOT: join(root, 'installed-opt'),
    KRIYAN_ETC_ROOT: join(root, 'installed-etc'),
    KRIYAN_STATE_ROOT: join(root, 'installed-state'),
    KRIYAN_SYSTEMD_ROOT: join(root, 'installed-systemd'),
    KRIYAN_SYSTEMCTL: systemctl,
    KRIYAN_RELEASE_ENV_OWNER: '',
    KRIYAN_VERSION: commit,
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const installed = Bun.spawnSync([
      harness, join(process.cwd(), 'packaging', 'scripts', 'install.sh'), archive,
    ], { env })
    expect(installed.exitCode, installed.stderr.toString()).toBe(0)
  }
  expect(await realpath(join(root, 'installed-opt', 'current'))).toBe(
    await realpath(join(root, 'installed-opt', 'releases', commit)),
  )
  expect(await readdir(join(root, 'installed-opt', 'releases'))).toEqual([commit])
  expect(await Array.fromAsync(new Bun.Glob('**/.current.*').scan({ cwd: root, onlyFiles: false }))).toEqual([])
}, 30_000)

async function uninstallFixture(mode: 'active' | 'unknown' | 'absent'): Promise<{
  root: string
  env: Record<string, string>
  harness: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-uninstall-'))
  roots.push(root)
  for (const directory of ['opt', 'etc', 'state', 'systemd', 'bin', 'fake']) {
    await mkdir(join(root, directory))
  }
  await writeFile(join(root, 'opt', 'sentinel'), 'opt')
  await writeFile(join(root, 'etc', 'sentinel'), 'etc')
  await writeFile(join(root, 'state', 'sentinel'), 'state')
  await writeFile(join(root, 'systemd', 'kriyan-node.service'), 'unit')
  const systemctl = join(root, 'fake', 'systemctl')
  await executable(systemctl, `#!/usr/bin/env bash
set -euo pipefail
case $1 in
  show) printf '%s\n' "${mode === 'absent' ? 'not-found' : 'loaded'}" ;;
  disable) exit 1 ;;
  is-active) printf '%s\n' "${mode}"; [[ ${mode} == inactive ]] ;;
  daemon-reload) exit 0 ;;
esac
`)
  const harness = join(root, 'uninstall-harness')
  await executable(harness, `#!/usr/bin/env bash
set -euo pipefail
source "$1"
shift
uninstall_main 0 "$@"
`)
  return {
    root,
    harness,
    env: {
      ...process.env,
      KRIYAN_OPT_ROOT: join(root, 'opt'),
      KRIYAN_ETC_ROOT: join(root, 'etc'),
      KRIYAN_STATE_ROOT: join(root, 'state'),
      KRIYAN_SYSTEMD_ROOT: join(root, 'systemd'),
      KRIYAN_BIN_ROOT: join(root, 'bin'),
      KRIYAN_SYSTEMCTL: systemctl,
    },
  }
}

for (const mode of ['active', 'unknown'] as const) {
  test(`uninstall preserves installation and config when stop state is ${mode}`, async () => {
    const item = await uninstallFixture(mode)
    const result = Bun.spawnSync([
      item.harness, join(process.cwd(), 'packaging', 'scripts', 'uninstall.sh'), '--preserve-data',
    ], { env: item.env })
    expect(result.exitCode).toBe(1)
    expect(await readFile(join(item.root, 'opt', 'sentinel'), 'utf8')).toBe('opt')
    expect(await readFile(join(item.root, 'etc', 'sentinel'), 'utf8')).toBe('etc')
  })
}

test('uninstall remains idempotent when the service is absent', async () => {
  const item = await uninstallFixture('absent')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = Bun.spawnSync([
      item.harness, join(process.cwd(), 'packaging', 'scripts', 'uninstall.sh'), '--preserve-data',
    ], { env: item.env })
    expect(result.exitCode, result.stderr.toString()).toBe(0)
  }
  expect(await Bun.file(join(item.root, 'state', 'sentinel')).text()).toBe('state')
  expect(await Bun.file(join(item.root, 'opt')).exists()).toBe(false)
  expect(await Bun.file(join(item.root, 'etc')).exists()).toBe(false)
})
