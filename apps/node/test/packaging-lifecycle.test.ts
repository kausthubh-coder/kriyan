import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readlink, realpath, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, setDefaultTimeout, test } from 'bun:test'

setDefaultTimeout(30_000)

const OLD_SHA = '1111111111111111111111111111111111111111'
const NEW_SHA = '2222222222222222222222222222222222222222'
const roots: string[] = []

type ForwardFailure = 'daemon-reload' | 'restart' | 'health' | 'none'
type RecoveryFailure =
  | 'pointer'
  | 'environment'
  | 'unit'
  | 'daemon-reload'
  | 'restart'
  | 'active-state'
  | 'health'
  | 'none'

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

async function lifecycleFixture(
  forwardFailure: ForwardFailure,
  recoveryFailure: RecoveryFailure = 'none',
): Promise<LifecycleFixture> {
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
  const fakeMv = join(fakeRoot, 'mv')
  await executable(fakeMv, `#!/usr/bin/env bash
set -euo pipefail
source=''
destination=''
for argument in "$@"; do
  source=$destination
  destination=$argument
done
if [[ $# -ge 3 && $KRIYAN_RECOVERY_FAILURE_STAGE == pointer && $destination == "$KRIYAN_OPT_ROOT/current" && -L $source ]]; then
  target=$(readlink "$source")
  if [[ $(basename "$target") == "$KRIYAN_PREVIOUS_RELEASE" ]]; then
    echo "injected recovery pointer failure" >&2
    exit 81
  fi
fi
exec /bin/mv "$@"
`)
  const fakeCp = join(fakeRoot, 'cp')
  await executable(fakeCp, `#!/usr/bin/env bash
set -euo pipefail
source=''
destination=''
for argument in "$@"; do
  source=$destination
  destination=$argument
done
if [[ $KRIYAN_RECOVERY_FAILURE_STAGE == environment && $source == */state/release.env ]]; then
  echo "injected recovery environment failure" >&2
  exit 82
fi
if [[ $KRIYAN_RECOVERY_FAILURE_STAGE == unit && $source == */state/kriyan-node.service ]]; then
  echo "injected recovery unit failure" >&2
  exit 83
fi
exec /bin/cp "$@"
`)
  const fakeSystemctl = join(fakeRoot, 'systemctl')
  await executable(fakeSystemctl, `#!/usr/bin/env bash
set -euo pipefail
command=$1
current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
printf '%s %s\n' "$command" "$current" >>"$KRIYAN_SYSTEMCTL_LOG"
stage=$command
[[ $command == is-active ]] && stage=active-state
if [[ $current == "$KRIYAN_TARGET_RELEASE" && $stage == "$KRIYAN_FORWARD_FAILURE_STAGE" ]]; then
  exit 1
fi
if [[ $current == "$KRIYAN_PREVIOUS_RELEASE" && $stage == "$KRIYAN_RECOVERY_FAILURE_STAGE" ]]; then
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
if [[ $expected == "$KRIYAN_TARGET_RELEASE" && $KRIYAN_FORWARD_FAILURE_STAGE == health ]]; then
  exit 1
fi
if [[ $expected == "$KRIYAN_PREVIOUS_RELEASE" && $KRIYAN_RECOVERY_FAILURE_STAGE == health ]]; then
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
      PATH: `${fakeRoot}:${process.env.PATH ?? ''}`,
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
      KRIYAN_PREVIOUS_RELEASE: OLD_SHA,
      KRIYAN_FORWARD_FAILURE_STAGE: forwardFailure,
      KRIYAN_RECOVERY_FAILURE_STAGE: recoveryFailure,
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

async function expectFailedRecoveryState(
  item: LifecycleFixture,
  failure: Exclude<RecoveryFailure, 'none'>,
): Promise<void> {
  const expectedPointer = failure === 'pointer' ? item.newRelease : item.oldRelease
  const expectedEnvironment = ['pointer', 'environment'].includes(failure)
    ? `KRIYAN_RELEASE_VERSION=${NEW_SHA}\n`
    : item.oldEnvironment
  const expectedUnit = ['pointer', 'environment', 'unit'].includes(failure)
    ? `unit-${NEW_SHA}\n`
    : item.oldUnit

  expect(await realpath(join(item.root, 'opt', 'current'))).toBe(await realpath(expectedPointer))
  expect(await readFile(join(item.root, 'etc', 'release.env'), 'utf8')).toBe(expectedEnvironment)
  expect(await readFile(join(item.root, 'systemd', 'kriyan-node.service'), 'utf8')).toBe(expectedUnit)

  const systemctlEntries = (await readFile(item.systemctlLog, 'utf8')).trim().split('\n')
  const recoveryEntries = systemctlEntries.filter((entry) => entry.endsWith(` ${OLD_SHA}`))
  const expectedRecoveryEntries: Record<Exclude<RecoveryFailure, 'none'>, string[]> = {
    pointer: [],
    environment: [],
    unit: [],
    'daemon-reload': [`daemon-reload ${OLD_SHA}`],
    restart: [`daemon-reload ${OLD_SHA}`, `restart ${OLD_SHA}`],
    'active-state': [
      `daemon-reload ${OLD_SHA}`,
      `restart ${OLD_SHA}`,
      `is-active ${OLD_SHA}`,
    ],
    health: [
      `daemon-reload ${OLD_SHA}`,
      `restart ${OLD_SHA}`,
      `is-active ${OLD_SHA}`,
    ],
  }
  expect(recoveryEntries).toEqual(expectedRecoveryEntries[failure])

  const healthEntries = (await readFile(item.healthLog, 'utf8')).trim().split('\n')
  expect(healthEntries).toContain(NEW_SHA)
  expect(healthEntries.includes(OLD_SHA)).toBe(failure === 'health')
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

for (const recoveryFailure of [
  'pointer',
  'environment',
  'unit',
  'daemon-reload',
  'restart',
  'active-state',
  'health',
] as const) {
  for (const operation of ['update', 'rollback'] as const) {
    test(`${operation} reports ${recoveryFailure} failure while recovering the previous release`, async () => {
      const item = await lifecycleFixture('health', recoveryFailure)
      const command = operation === 'update'
        ? ['bash', 'packaging/scripts/update.sh', join(item.root, 'release.tar.gz')]
        : ['bash', 'packaging/scripts/rollback.sh', NEW_SHA]
      const result = Bun.spawnSync(command, { env: item.env })
      const stderr = result.stderr.toString()

      expect(result.exitCode).toBe(1)
      expect(stderr).toContain(`previous release recovery failed at ${recoveryFailure} stage`)
      expect(stderr).toContain(`${operation} failed; previous release recovery also failed`)
      expect(stderr).not.toContain('complete previous release state restored and healthy')
      await expectFailedRecoveryState(item, recoveryFailure)
    })
  }
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
  const bootstrap = join(root, 'bare-host-bootstrap')
  await mkdir(bootstrap)
  expect(Bun.spawnSync(['tar', '-xzf', archive, '-C', bootstrap]).exitCode).toBe(0)
  const trustedIdentity = join(root, 'trusted-release-identity.manifest')
  await writeFile(trustedIdentity, [
    `source_commit=${commit}`,
    `source_tree=${tree}`,
    `source_date_epoch=${epoch}`,
    `lock_sha256=${hash(await readFile('bun.lock'))}`,
    `bun_version=${Bun.version}`,
    '',
  ].join('\n'))
  await chmod(trustedIdentity, 0o600)

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
    KRIYAN_TRUSTED_IDENTITY_FILE: trustedIdentity,
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const installed = Bun.spawnSync([
      harness, join(bootstrap, 'packaging', 'scripts', 'install.sh'), archive,
    ], { cwd: root, env })
    expect(installed.exitCode, installed.stderr.toString()).toBe(0)
  }
  expect(await realpath(join(root, 'installed-opt', 'current'))).toBe(
    await realpath(join(root, 'installed-opt', 'releases', commit)),
  )
  expect(await readdir(join(root, 'installed-opt', 'releases'))).toEqual([commit])
  expect(await Array.fromAsync(new Bun.Glob('**/.current.*').scan({ cwd: root, onlyFiles: false }))).toEqual([])
}, 30_000)

type InstallFailure =
  | 'config'
  | 'link'
  | 'daemon-reload'
  | 'restart'
  | 'health'
  | 'install-early'
  | 'none'

type InstallRecoveryFailure =
  | 'time-read'
  | 'path'
  | 'daemon-reload'
  | 'enable'
  | 'disable'
  | 'restart'
  | 'health'
  | 'none'

interface InstallTransactionFixture {
  root: string
  env: Record<string, string>
  oldRelease: string | null
  newRelease: string
  config: string
  oldConfig: string
  command: string
  current: string
  enabledState: string
  activeState: string
  healthLog: string
}

async function installTransactionFixture(options: {
  prior: boolean
  active?: boolean
  enabled?: boolean
  failure: InstallFailure
  recoveryFailure?: InstallRecoveryFailure
}): Promise<InstallTransactionFixture> {
  const root = await mkdtemp(join(tmpdir(), 'kriyan-install-transaction-'))
  roots.push(root)
  for (const directory of ['opt/releases', 'etc', 'systemd', 'bin', 'fake', 'state', 'lock']) {
    await mkdir(join(root, directory), { recursive: true })
  }
  const oldRelease = options.prior ? await release(root, OLD_SHA) : null
  const target = await release(root, NEW_SHA)
  const template = join(root, 'new-release-template')
  await cp(target, template, { recursive: true })
  await rm(target, { recursive: true })
  const current = join(root, 'opt', 'current')
  const config = join(root, 'etc', 'node.json')
  const command = join(root, 'bin', 'kriyan')
  const oldConfig = '{"node":"old"}\n'
  if (oldRelease !== null) {
    await symlink(oldRelease, current)
    await writeFile(config, oldConfig, { mode: 0o600 })
    await writeFile(join(root, 'etc', 'release.env'), `KRIYAN_RELEASE_VERSION=${OLD_SHA}\n`)
    await writeFile(join(root, 'systemd', 'kriyan-node.service'), `unit-${OLD_SHA}\n`)
    await symlink('../opt/current/bin/kriyan', command)
  }
  const newConfig = join(root, 'changed-node.json')
  await writeFile(newConfig, '{"node":"new"}\n')
  const enabledState = join(root, 'enabled')
  const activeState = join(root, 'active')
  if (options.enabled ?? options.prior) await writeFile(enabledState, '')
  if (options.active ?? options.prior) await writeFile(activeState, '')
  const systemctlLog = join(root, 'systemctl.log')
  const healthLog = join(root, 'health.log')
  const fakeSystemctl = join(root, 'fake', 'systemctl')
  await executable(fakeSystemctl, `#!/usr/bin/env bash
set -euo pipefail
command=$1
current=none
[[ -L $KRIYAN_OPT_ROOT/current ]] && current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
printf '%s %s\n' "$command" "$current" >>"$KRIYAN_SYSTEMCTL_LOG"
if [[ $current == "$KRIYAN_TARGET_RELEASE" && $command == "$KRIYAN_FORWARD_FAILURE_STAGE" ]]; then exit 31; fi
if [[ $command == "$KRIYAN_RECOVERY_FAILURE_STAGE" && ( $current == "$KRIYAN_PREVIOUS_RELEASE" || $command == disable ) ]]; then exit 41; fi
case $command in
  is-enabled) [[ -f $KRIYAN_ENABLED_STATE ]] ;;
  is-active) [[ -f $KRIYAN_ACTIVE_STATE ]] || exit 3 ;;
  enable) touch "$KRIYAN_ENABLED_STATE" ;;
  disable)
    rm -f "$KRIYAN_ENABLED_STATE"
    [[ -f $KRIYAN_SYSTEMD_ROOT/kriyan-node.service ]] || exit 5
    ;;
  restart) touch "$KRIYAN_ACTIVE_STATE" ;;
  stop)
    rm -f "$KRIYAN_ACTIVE_STATE"
    [[ -f $KRIYAN_SYSTEMD_ROOT/kriyan-node.service ]] || exit 5
    ;;
  daemon-reload) ;;
  *) exit 64 ;;
esac
`)
  await executable(join(root, 'fake', 'install'), `#!/usr/bin/env bash
set -euo pipefail
arguments=()
while (($#)); do
  case $1 in -o|-g) shift 2 ;; *) arguments+=("$1"); shift ;; esac
done
destination=''
for argument in "${'${arguments[@]}'}"; do destination=$argument; done
if [[ $KRIYAN_FORWARD_FAILURE_STAGE == config && $destination == *.partial.* ]]; then exit 32; fi
exec /usr/bin/install "${'${arguments[@]}'}"
`)
  await executable(join(root, 'fake', 'ln'), `#!/usr/bin/env bash
set -euo pipefail
destination=${'${!#}'}
source=''
previous=''
for argument in "$@"; do previous=$source; source=$argument; done
source=$previous
if [[ $KRIYAN_FORWARD_FAILURE_STAGE == link && $destination == "$KRIYAN_COMMAND_PATH" && $source == /* ]]; then exit 33; fi
if [[ $KRIYAN_RECOVERY_FAILURE_STAGE == path && $destination == "$KRIYAN_OPT_ROOT/current" && $source == "$KRIYAN_OLD_RELEASE_PATH" ]]; then exit 43; fi
exec /bin/ln "$@"
`)
  await executable(join(root, 'fake', 'date'), '#!/usr/bin/env bash\nprintf "not-a-time\\n"\n')
  await executable(join(root, 'fake', 'perl'), `#!/usr/bin/env bash
set -euo pipefail
current=none
[[ -L $KRIYAN_OPT_ROOT/current ]] && current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
if [[ $current == "$KRIYAN_PREVIOUS_RELEASE" && $KRIYAN_RECOVERY_FAILURE_STAGE == time-read ]]; then exit 42; fi
exec /usr/bin/perl "$@"
`)
  const waitForHealth = join(root, 'fake', 'wait-for-health')
  await executable(waitForHealth, `#!/usr/bin/env bash
set -euo pipefail
expected=$3
printf '%s\n' "$expected" >>"$KRIYAN_HEALTH_LOG"
current=$(basename "$(readlink "$KRIYAN_OPT_ROOT/current")")
[[ $current == "$expected" ]]
if [[ $expected == "$KRIYAN_TARGET_RELEASE" ]]; then
  grep -q '"node":"new"' "$2"
  [[ $KRIYAN_FORWARD_FAILURE_STAGE != health ]] || exit 34
else
  grep -q '"node":"old"' "$2"
  [[ $KRIYAN_RECOVERY_FAILURE_STAGE != health ]] || exit 44
fi
`)
  const processHealth = join(root, 'fake', 'process-health')
  await executable(processHealth, '#!/usr/bin/env bash\nprintf "instance-old\\told\\t1\\n"\n')
  const validateRelease = join(root, 'fake', 'validate-release')
  await executable(validateRelease, '#!/usr/bin/env bash\nexit 0\n')
  const installRelease = join(root, 'fake', 'install-release')
  await executable(installRelease, `#!/usr/bin/env bash
set -euo pipefail
if [[ $KRIYAN_FORWARD_FAILURE_STAGE == install-early ]]; then exit 30; fi
source "$KRIYAN_LIFECYCLE_LIB"
target=$(release_path "$KRIYAN_VERSION")
[[ -d $target ]] || cp -R "$KRIYAN_NEW_TEMPLATE" "$target"
activate_release_state "$target" "$KRIYAN_VERSION"
`)
  return {
    root,
    oldRelease,
    newRelease: join(await realpath(join(root, 'opt', 'releases')), NEW_SHA),
    config,
    oldConfig,
    command,
    current,
    enabledState,
    activeState,
    healthLog,
    env: {
      ...process.env,
      PATH: `${join(root, 'fake')}:${process.env.PATH ?? ''}`,
      KRIYAN_OPT_ROOT: join(root, 'opt'),
      KRIYAN_ETC_ROOT: join(root, 'etc'),
      KRIYAN_STATE_ROOT: join(root, 'state'),
      KRIYAN_SYSTEMD_ROOT: join(root, 'systemd'),
      KRIYAN_BIN_ROOT: join(root, 'bin'),
      KRIYAN_INSTALL_LOCK: join(root, 'lock', 'transaction'),
      KRIYAN_SYSTEMCTL: fakeSystemctl,
      KRIYAN_SYSTEMCTL_LOG: systemctlLog,
      KRIYAN_ENABLED_STATE: enabledState,
      KRIYAN_ACTIVE_STATE: activeState,
      KRIYAN_HEALTH_LOG: healthLog,
      KRIYAN_WAIT_FOR_HEALTH: waitForHealth,
      KRIYAN_PROCESS_HEALTH_READER: processHealth,
      KRIYAN_VALIDATE_INSTALLED_RELEASE: validateRelease,
      KRIYAN_RELEASE_ENV_OWNER: '',
      KRIYAN_INSTALL_SCRIPT: installRelease,
      KRIYAN_LIFECYCLE_LIB: join(process.cwd(), 'packaging', 'scripts', 'lifecycle-lib.sh'),
      KRIYAN_NEW_TEMPLATE: template,
      KRIYAN_COMMAND_PATH: command,
      KRIYAN_OLD_RELEASE_PATH: oldRelease ?? '',
      KRIYAN_TARGET_RELEASE: NEW_SHA,
      KRIYAN_PREVIOUS_RELEASE: OLD_SHA,
      KRIYAN_FORWARD_FAILURE_STAGE: options.failure,
      KRIYAN_RECOVERY_FAILURE_STAGE: options.recoveryFailure ?? 'none',
      KRIYAN_VERSION: NEW_SHA,
      KRIYAN_SOURCE_CONFIG: newConfig,
    },
  }
}

function runInstallTransaction(item: InstallTransactionFixture): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([
    'bash', '-c',
    'source "$1"; shift; install_transaction_main 0 "$@"', '--',
    join(process.cwd(), 'packaging', 'scripts', 'install-transaction.sh'),
    join(item.root, 'release.tar.gz'), item.env.KRIYAN_SOURCE_CONFIG!,
  ], { env: item.env })
}

function spawnStderr(result: ReturnType<typeof Bun.spawnSync>): string {
  return result.stderr?.toString() ?? ''
}

async function expectActiveInstallStateRestored(item: InstallTransactionFixture): Promise<void> {
  expect(await readlink(item.current)).toBe(item.oldRelease!)
  expect(await readFile(item.config, 'utf8')).toBe(item.oldConfig)
  expect((await lstat(item.config)).mode & 0o777).toBe(0o600)
  expect(await readFile(join(item.root, 'etc', 'release.env'), 'utf8')).toBe(
    `KRIYAN_RELEASE_VERSION=${OLD_SHA}\n`,
  )
  expect(await readFile(join(item.root, 'systemd', 'kriyan-node.service'), 'utf8')).toBe(
    `unit-${OLD_SHA}\n`,
  )
  expect(await readlink(item.command)).toBe('../opt/current/bin/kriyan')
  expect(await Bun.file(item.enabledState).exists()).toBe(true)
  expect(await Bun.file(item.activeState).exists()).toBe(true)
  expect((await readFile(item.healthLog, 'utf8')).trim().split('\n').at(-1)).toBe(OLD_SHA)
}

for (const failure of ['config', 'link', 'daemon-reload', 'restart', 'health'] as const) {
  test(`install transaction restores changed active installation after ${failure} failure`, async () => {
    const item = await installTransactionFixture({ prior: true, failure })
    const result = runInstallTransaction(item)
    const expectedStatus = { config: 32, link: 33, 'daemon-reload': 31, restart: 31, health: 34 }
    expect(result.exitCode, spawnStderr(result)).toBe(expectedStatus[failure])
    await expectActiveInstallStateRestored(item)
    expect(await Bun.file(item.newRelease).exists()).toBe(false)
  })
}

test('install transaction restores an inactive and disabled prior installation exactly', async () => {
  const item = await installTransactionFixture({
    prior: true,
    active: false,
    enabled: false,
    failure: 'health',
  })
  const result = runInstallTransaction(item)
  expect(result.exitCode).not.toBe(0)
  expect(await readlink(item.current)).toBe(item.oldRelease!)
  expect(await readFile(item.config, 'utf8')).toBe(item.oldConfig)
  expect(await Bun.file(item.enabledState).exists()).toBe(false)
  expect(await Bun.file(item.activeState).exists()).toBe(false)
})

test('fresh early failure is clean and a later install completes under the same lock contract', async () => {
  const item = await installTransactionFixture({ prior: false, failure: 'install-early' })
  const failed = runInstallTransaction(item)
  expect(failed.exitCode, spawnStderr(failed)).toBe(30)
  for (const path of [
    item.current,
    item.config,
    join(item.root, 'etc', 'release.env'),
    join(item.root, 'systemd', 'kriyan-node.service'),
    item.command,
    item.newRelease,
    item.enabledState,
    item.activeState,
  ]) expect(await Bun.file(path).exists()).toBe(false)

  item.env.KRIYAN_FORWARD_FAILURE_STAGE = 'none'
  const installed = runInstallTransaction(item)
  expect(installed.exitCode, spawnStderr(installed)).toBe(0)
  expect(await readlink(item.current)).toBe(item.newRelease)
  expect(await readFile(item.config, 'utf8')).toBe('{"node":"new"}\n')
  expect(await Bun.file(item.enabledState).exists()).toBe(true)
  expect(await Bun.file(item.activeState).exists()).toBe(true)
})

test('install transaction refuses an overlapping writer before mutation', async () => {
  const item = await installTransactionFixture({ prior: true, failure: 'none' })
  await mkdir(item.env.KRIYAN_INSTALL_LOCK!)
  const result = runInstallTransaction(item)
  expect(result.exitCode, spawnStderr(result)).toBe(75)
  expect(spawnStderr(result)).toContain('another install transaction holds')
  expect(await readlink(item.current)).toBe(item.oldRelease!)
  expect(await readFile(item.config, 'utf8')).toBe(item.oldConfig)
})

for (const recoveryFailure of [
  'time-read', 'path', 'daemon-reload', 'enable', 'restart', 'health',
] as const) {
  test(`install transaction preserves primary error and reports ${recoveryFailure} recovery failure`, async () => {
    const item = await installTransactionFixture({
      prior: true,
      failure: 'health',
      recoveryFailure,
    })
    const result = runInstallTransaction(item)
    expect(result.exitCode, spawnStderr(result)).toBe(70)
    expect(spawnStderr(result)).toContain('install transaction failed')
    expect(spawnStderr(result)).toContain('recovery failed')
  })
}

test('install transaction reports disabled-state recovery failure explicitly', async () => {
  const item = await installTransactionFixture({
    prior: true,
    active: false,
    enabled: false,
    failure: 'health',
    recoveryFailure: 'disable',
  })
  const result = runInstallTransaction(item)
  expect(result.exitCode, spawnStderr(result)).toBe(70)
  expect(spawnStderr(result)).toContain('install transaction failed')
  expect(spawnStderr(result)).toContain('recovery failed')
})

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
