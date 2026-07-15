import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { loadConfig, type NodeConfig } from '../../node/src/config'
import { readProcessHealth } from '../../node/src/process-health'

import { withTrustedReleaseVerifier } from './release-verifier'

export type VpsAction =
  | 'install'
  | 'status'
  | 'doctor'
  | 'update'
  | 'rollback'
  | 'restart'
  | 'uninstall'

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { env?: Record<string, string> }): Promise<CommandResult>
}

export interface VpsDependencies {
  runner?: CommandRunner
  platform?: NodeJS.Platform
  isRoot?: boolean
  executablePath?: string
  randomId?: () => string
  paths?: Partial<VpsPaths>
}

interface VpsPaths {
  optRoot: string
  configPath: string
  stateRoot: string
  systemdUnit: string
  commandPath: string
}

interface SshOptions {
  host: string
  user: string
  port: number
  identity?: string
  knownHosts: string
  hostKeyPolicy: 'strict' | 'accept-new'
}

interface ParsedOptions {
  values: Map<string, string>
  flags: Set<string>
}

export class VpsUsageError extends Error {
  readonly code = 'USAGE_ERROR'
}

export class VpsRuntimeError extends Error {
  readonly code = 'VPS_COMMAND_FAILED'
}

const DEFAULT_PATHS: VpsPaths = {
  optRoot: '/opt/kriyan',
  configPath: '/etc/kriyan/node.json',
  stateRoot: '/var/lib/kriyan',
  systemdUnit: '/etc/systemd/system/kriyan-node.service',
  commandPath: '/usr/local/bin/kriyan',
}

const ACTION_OPTIONS: Record<VpsAction, ReadonlySet<string>> = {
  install: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts',
    '--host-key-policy', '--release', '--checksum', '--version', '--config',
  ]),
  update: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts',
    '--host-key-policy', '--release', '--checksum', '--version',
  ]),
  status: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts', '--host-key-policy',
  ]),
  doctor: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts', '--host-key-policy',
  ]),
  restart: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts', '--host-key-policy',
  ]),
  rollback: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts',
    '--host-key-policy', '--version',
  ]),
  uninstall: new Set([
    '--local', '--host', '--user', '--port', '--identity', '--known-hosts',
    '--host-key-policy', '--preserve-data', '--purge-data',
  ]),
}

const BOOLEAN_OPTIONS = new Set(['--local', '--preserve-data', '--purge-data'])
const RELEASE_VERSION = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const SSH_HOST = /^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/
const SSH_USER = /^[a-z_][a-z0-9_-]{0,31}$/i

const defaultRunner: CommandRunner = {
  async run(command, args, options = {}) {
    const child = Bun.spawn([command, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: options.env === undefined ? process.env : { ...process.env, ...options.env },
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  },
}

function parseOptions(action: VpsAction, args: string[]): ParsedOptions {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const allowed = ACTION_OPTIONS[action]
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === undefined || !option.startsWith('--') || !allowed.has(option)) {
      throw new VpsUsageError(`unknown option for vps ${action}: ${option ?? ''}`)
    }
    if (values.has(option) || flags.has(option)) throw new VpsUsageError(`duplicate option: ${option}`)
    if (BOOLEAN_OPTIONS.has(option)) {
      flags.add(option)
      continue
    }
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) throw new VpsUsageError(`${option} requires a value`)
    values.set(option, value)
    index += 1
  }
  if (flags.has('--preserve-data') && flags.has('--purge-data')) {
    throw new VpsUsageError('--preserve-data and --purge-data are mutually exclusive')
  }
  return { values, flags }
}

function required(options: ParsedOptions, name: string): string {
  const value = options.values.get(name)
  if (value === undefined || value.length === 0) throw new VpsUsageError(`${name} is required`)
  return value
}

function releaseVersion(options: ParsedOptions): string {
  const version = required(options, '--version')
  if (!RELEASE_VERSION.test(version)) {
    throw new VpsUsageError('--version must be the exact 40-character source commit')
  }
  return version
}

function parseSsh(options: ParsedOptions): SshOptions {
  const host = required(options, '--host')
  const user = required(options, '--user')
  const knownHosts = resolve(required(options, '--known-hosts'))
  const portValue = options.values.get('--port') ?? '22'
  const port = Number(portValue)
  const hostKeyPolicy = options.values.get('--host-key-policy') ?? 'strict'
  if (!SSH_HOST.test(host)) throw new VpsUsageError('--host is invalid')
  if (!SSH_USER.test(user)) throw new VpsUsageError('--user is invalid')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new VpsUsageError('--port must be an integer between 1 and 65535')
  }
  if (hostKeyPolicy !== 'strict' && hostKeyPolicy !== 'accept-new') {
    throw new VpsUsageError('--host-key-policy must be strict or accept-new')
  }
  return {
    host,
    user,
    port,
    knownHosts,
    hostKeyPolicy,
    identity: options.values.get('--identity') === undefined
      ? undefined
      : resolve(required(options, '--identity')),
  }
}

function sshArguments(options: SshOptions): string[] {
  const args = [
    '-p', String(options.port),
    '-o', 'BatchMode=yes',
    '-o', `UserKnownHostsFile=${options.knownHosts}`,
    '-o', `StrictHostKeyChecking=${options.hostKeyPolicy === 'strict' ? 'yes' : 'accept-new'}`,
  ]
  if (options.identity !== undefined) args.push('-o', 'IdentitiesOnly=yes', '-i', options.identity)
  return args
}

function scpArguments(options: SshOptions): string[] {
  const args = sshArguments(options)
  args[0] = '-P'
  return args
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function checked(
  runner: CommandRunner,
  command: string,
  args: string[],
  label: string,
  options?: { env?: Record<string, string> },
): Promise<CommandResult> {
  const result = await runner.run(command, args, options)
  if (result.exitCode !== 0) {
    const diagnostic = result.stderr
      .split('\n')
      .map((line) => line.trim())
      .findLast((line) => /^update failed at [a-z-]+ stage \(status [0-9]+\); (previous release restored and healthy|previous release recovery also failed)$/.test(line))
    throw new VpsRuntimeError(
      diagnostic === undefined
        ? `${label} failed (status ${result.exitCode})`
        : `${label} failed: ${diagnostic}`,
    )
  }
  return result
}

async function sha256(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function expectedChecksum(path: string, archive: string): Promise<string> {
  const value = (await readFile(path, 'utf8')).trim()
  const match = /^([0-9a-f]{64})\s+\*?([^\s]+)$/.exec(value)
  if (match === null || !SHA256.test(match[1]!)) throw new VpsUsageError('checksum file is invalid')
  if (basename(match[2]!) !== basename(archive)) {
    throw new VpsUsageError('checksum filename does not match the release archive')
  }
  return match[1]!
}

async function verifyRelease(
  runner: CommandRunner,
  archive: string,
  checksumPath: string,
  expectedCommit: string,
): Promise<{ hash: string; trustedIdentity: string }> {
  const expected = await expectedChecksum(checksumPath, archive)
  const actual = await sha256(archive)
  if (actual !== expected) throw new VpsUsageError('release archive checksum does not match')
  const trustedIdentity = await withTrustedReleaseVerifier(
    runner,
    async (verifier, verifierOptions, exportedIdentityPath) => {
      await checked(
        runner,
        'bash',
        [verifier, archive, expectedCommit],
        'release provenance verification',
        verifierOptions,
      )
      return await readFile(exportedIdentityPath, 'utf8')
    },
  )
  return { hash: actual, trustedIdentity }
}

function executableReleaseRoot(executablePath: string): string {
  const executable = resolve(executablePath)
  return dirname(dirname(executable))
}

function packagingEnvironment(paths: VpsPaths, version?: string): Record<string, string> {
  return {
    KRIYAN_OPT_ROOT: paths.optRoot,
    KRIYAN_ETC_ROOT: dirname(paths.configPath),
    KRIYAN_STATE_ROOT: paths.stateRoot,
    KRIYAN_SYSTEMD_ROOT: dirname(paths.systemdUnit),
    KRIYAN_BIN_ROOT: dirname(paths.commandPath),
    ...(version === undefined ? {} : { KRIYAN_VERSION: version }),
  }
}

async function serviceState(runner: CommandRunner): Promise<{ enabled: boolean; active: boolean }> {
  const enabled = await runner.run('systemctl', ['is-enabled', '--quiet', 'kriyan-node'])
  const active = await runner.run('systemctl', ['is-active', '--quiet', 'kriyan-node'])
  return { enabled: enabled.exitCode === 0, active: active.exitCode === 0 }
}

async function currentRelease(paths: VpsPaths): Promise<{ version: string; path: string } | null> {
  try {
    const path = await realpath(join(paths.optRoot, 'current'))
    return { version: basename(path), path }
  } catch {
    return null
  }
}

async function localStatus(
  action: 'status' | 'doctor',
  runner: CommandRunner,
  paths: VpsPaths,
): Promise<Record<string, unknown>> {
  const release = await currentRelease(paths)
  const service = await serviceState(runner)
  let config: 'pass' | 'fail' = 'fail'
  let processHealth: 'pass' | 'fail' = 'fail'
  let releaseIdentity: 'pass' | 'fail' = 'fail'
  try {
    const parsed = await loadConfig(paths.configPath)
    config = 'pass'
    const health = await readProcessHealth(parsed.dataDir)
    if (health !== null && health.ready) {
      processHealth = 'pass'
      if (release !== null && health.releaseId === release.version) releaseIdentity = 'pass'
    }
  } catch {
    // Report only stable check states; config contents and parse details stay private.
  }
  const ok = release !== null && service.enabled && service.active && config === 'pass' &&
    (action === 'status' || (processHealth === 'pass' && releaseIdentity === 'pass'))
  return {
    ok,
    command: `vps ${action}`,
    local: true,
    release,
    service,
    doctor: { config, processHealth, releaseIdentity },
  }
}

async function ensureLocalHost(dependencies: VpsDependencies): Promise<void> {
  if ((dependencies.platform ?? process.platform) !== 'linux') {
    throw new VpsUsageError('--local node maintenance requires Linux')
  }
  if (!(dependencies.isRoot ?? process.geteuid?.() === 0)) {
    throw new VpsUsageError('--local node maintenance must run as root')
  }
}

async function loadInstalledConfig(path: string, stateRoot: string): Promise<NodeConfig> {
  const config = await loadConfig(path)
  const root = resolve(stateRoot)
  const child = relative(root, config.dataDir)
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new VpsUsageError(`installed config dataDir must be within ${root}`)
  }
  return config
}

async function installCommandLink(runner: CommandRunner, paths: VpsPaths): Promise<void> {
  await checked(runner, 'install', ['-d', '-o', 'root', '-g', 'root', '-m', '0755', dirname(paths.commandPath)], 'command directory creation')
  try {
    const existing = await lstat(paths.commandPath)
    if (existing.isDirectory()) throw new VpsRuntimeError('command path is an existing directory')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await checked(runner, 'ln', ['-sfn', join(paths.optRoot, 'current', 'bin', 'kriyan'), paths.commandPath], 'command link installation')
}

async function localReleaseAction(
  action: 'install' | 'update',
  options: ParsedOptions,
  dependencies: VpsDependencies,
  runner: CommandRunner,
  paths: VpsPaths,
): Promise<Record<string, unknown>> {
  await ensureLocalHost(dependencies)
  const archive = resolve(required(options, '--release'))
  const checksumPath = resolve(required(options, '--checksum'))
  const version = releaseVersion(options)
  const verified = await verifyRelease(runner, archive, checksumPath, version)
  const executablePath = dependencies.executablePath ?? process.execPath
  const root = executableReleaseRoot(await realpath(executablePath))
  const script = join(
    root,
    'packaging',
    'scripts',
    action === 'install' ? 'install-transaction.sh' : 'update.sh',
  )
  const sourceConfig = action === 'install' ? resolve(required(options, '--config')) : undefined
  if (sourceConfig === undefined) await loadInstalledConfig(paths.configPath, paths.stateRoot)
  else {
    await loadInstalledConfig(sourceConfig, paths.stateRoot)
    if (await currentRelease(paths) !== null) {
      try {
        await loadInstalledConfig(paths.configPath, paths.stateRoot)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  const trustedRoot = await mkdtemp(join(tmpdir(), 'kriyan-install-identity-'))
  try {
    const trustedIdentityPath = join(trustedRoot, 'trusted-release-identity.manifest')
    await writeFile(trustedIdentityPath, verified.trustedIdentity, { mode: 0o600 })
    await checked(
      runner,
      'bash',
      [script, archive, ...(sourceConfig === undefined ? [] : [sourceConfig])],
      `local ${action}`,
      {
        env: {
          ...packagingEnvironment(paths, version),
          KRIYAN_TRUSTED_IDENTITY_FILE: trustedIdentityPath,
        },
      },
    )
  } finally {
    await rm(trustedRoot, { recursive: true, force: true })
  }
  if (action === 'update') await installCommandLink(runner, paths)
  const status = await localStatus('doctor', runner, paths)
  if (status.ok !== true) throw new VpsRuntimeError(`local ${action} health verification failed`)
  return {
    ...status,
    command: `vps ${action}`,
    artifact: { sha256: verified.hash },
    release: { version },
  }
}

async function localSimpleAction(
  action: Exclude<VpsAction, 'install' | 'update'>,
  options: ParsedOptions,
  dependencies: VpsDependencies,
  runner: CommandRunner,
  paths: VpsPaths,
): Promise<Record<string, unknown>> {
  await ensureLocalHost(dependencies)
  if (action === 'status' || action === 'doctor') return await localStatus(action, runner, paths)
  const executablePath = dependencies.executablePath ?? process.execPath
  const root = executableReleaseRoot(await realpath(executablePath))
  const scripts = join(root, 'packaging', 'scripts')
  if (action === 'rollback') {
    const version = releaseVersion(options)
    await checked(runner, 'bash', [join(scripts, 'rollback.sh'), version], 'local rollback', {
      env: packagingEnvironment(paths),
    })
    await installCommandLink(runner, paths)
  } else if (action === 'restart') {
    await checked(runner, 'bash', [join(scripts, 'restart.sh')], 'local restart', {
      env: packagingEnvironment(paths),
    })
  } else {
    if (!options.flags.has('--preserve-data') && !options.flags.has('--purge-data')) {
      throw new VpsUsageError('vps uninstall requires --preserve-data or --purge-data')
    }
    await checked(
      runner,
      'bash',
      [join(scripts, 'uninstall.sh'), options.flags.has('--purge-data') ? '--purge-data' : '--preserve-data'],
      'local uninstall',
      { env: packagingEnvironment(paths) },
    )
    return {
      ok: true,
      command: 'vps uninstall',
      local: true,
      data: options.flags.has('--purge-data') ? 'purged' : 'preserved',
    }
  }
  return { ...(await localStatus('doctor', runner, paths)), command: `vps ${action}` }
}

async function ssh(
  runner: CommandRunner,
  options: SshOptions,
  remoteArguments: string[],
  label: string,
): Promise<CommandResult> {
  const command = remoteArguments.map(shellQuote).join(' ')
  return await checked(
    runner,
    'ssh',
    [...sshArguments(options), `${options.user}@${options.host}`, command],
    label,
  )
}

function parseRemoteJson(result: CommandResult, action: VpsAction): Record<string, unknown> {
  const lines = result.stdout.trim().split('\n').filter(Boolean)
  try {
    const parsed = JSON.parse(lines.at(-1) ?? '') as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    return parsed
  } catch {
    throw new VpsRuntimeError(`remote vps ${action} returned invalid JSON`)
  }
}

async function remoteArtifactAction(
  action: 'install' | 'update',
  options: ParsedOptions,
  dependencies: VpsDependencies,
  runner: CommandRunner,
  sshOptions: SshOptions,
): Promise<Record<string, unknown>> {
  const archive = resolve(required(options, '--release'))
  const checksumPath = resolve(required(options, '--checksum'))
  const version = releaseVersion(options)
  const verified = await verifyRelease(runner, archive, checksumPath, version)
  if (action === 'install') {
    await loadInstalledConfig(resolve(required(options, '--config')), DEFAULT_PATHS.stateRoot)
  }
  const randomId = (dependencies.randomId ?? randomUUID)()
  if (!/^[A-Za-z0-9-]+$/.test(randomId)) throw new VpsRuntimeError('temporary transfer identifier is invalid')
  const remoteRoot = `/tmp/kriyan-transfer-${randomId}`
  const remoteArchive = `${remoteRoot}/release.tar.gz`
  const remoteChecksum = `${remoteRoot}/release.sha256`
  const remoteConfig = `${remoteRoot}/node.json`
  const remoteIdentity = `${remoteRoot}/trusted-release-identity.manifest`
  const localTemporary = await mkdtemp(join(tmpdir(), 'kriyan-transfer-'))
  const localChecksum = join(localTemporary, 'release.sha256')
  const localIdentity = join(localTemporary, 'trusted-release-identity.manifest')
  await writeFile(localChecksum, `${verified.hash}  release.tar.gz\n`, { mode: 0o600 })
  await writeFile(localIdentity, verified.trustedIdentity, { mode: 0o600 })
  let primaryError: unknown
  try {
    await ssh(runner, sshOptions, ['mkdir', '-m', '0700', remoteRoot], 'remote staging creation')
    const destination = `${sshOptions.user}@${sshOptions.host}:`
    for (const [source, target] of [
      [archive, remoteArchive],
      [localChecksum, remoteChecksum],
      [localIdentity, remoteIdentity],
      ...(action === 'install' ? [[resolve(required(options, '--config')), remoteConfig]] : []),
    ] as Array<[string, string]>) {
      await checked(
        runner,
        'scp',
        [...scpArguments(sshOptions), source, `${destination}${target}`],
        'release transfer',
      )
    }
    await ssh(
      runner,
      sshOptions,
      ['bash', '-c', `cd ${shellQuote(remoteRoot)} && sha256sum -c release.sha256`],
      'remote checksum verification',
    )
    await ssh(
      runner,
      sshOptions,
      ['mkdir', '-m', '0700', `${remoteRoot}/bootstrap`],
      'remote bootstrap creation',
    )
    await ssh(
      runner,
      sshOptions,
      ['tar', '-xzf', remoteArchive, '-C', `${remoteRoot}/bootstrap`],
      'remote release extraction',
    )
    const lifecycleScript = action === 'install' ? 'install-transaction.sh' : 'update.sh'
    const lifecycleArguments = [
      'env', `KRIYAN_TRUSTED_IDENTITY_FILE=${remoteIdentity}`,
      `KRIYAN_VERSION=${version}`,
      'bash', `${remoteRoot}/bootstrap/packaging/scripts/${lifecycleScript}`,
      remoteArchive,
      ...(action === 'install' ? [remoteConfig] : []),
    ].map(shellQuote).join(' ')
    await ssh(
      runner,
      sshOptions,
      ['sudo', 'bash', '-c', lifecycleArguments],
      `remote vps ${action}`,
    )
    const result = await ssh(
      runner,
      sshOptions,
      ['sudo', '/usr/local/bin/kriyan', 'vps', 'doctor', '--local'],
      `remote vps ${action} doctor`,
    )
    const doctor = parseRemoteJson(result, 'doctor')
    if (doctor.ok !== true) {
      throw new VpsRuntimeError(`remote vps ${action} health verification failed`)
    }
    return {
      ...doctor,
      command: `vps ${action}`,
      artifact: { sha256: verified.hash },
      release: { version },
      host: sshOptions.host,
      transport: {
        user: sshOptions.user,
        port: sshOptions.port,
        hostKeyPolicy: sshOptions.hostKeyPolicy,
        identity: sshOptions.identity === undefined ? 'ssh-agent-or-default' : 'explicit-file',
      },
    }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    await rm(localTemporary, { recursive: true, force: true })
    const cleanup = await runner.run('ssh', [
      ...sshArguments(sshOptions),
      `${sshOptions.user}@${sshOptions.host}`,
      ['rm', '-rf', '--', remoteRoot].map(shellQuote).join(' '),
    ])
    if (primaryError === undefined && cleanup.exitCode !== 0) {
      throw new VpsRuntimeError('remote transfer cleanup failed')
    }
  }
}

async function remoteSimpleAction(
  action: Exclude<VpsAction, 'install' | 'update'>,
  options: ParsedOptions,
  runner: CommandRunner,
  sshOptions: SshOptions,
): Promise<Record<string, unknown>> {
  const remote = ['sudo', '/usr/local/bin/kriyan', 'vps', action, '--local']
  if (action === 'rollback') remote.push('--version', releaseVersion(options))
  if (action === 'uninstall') {
    if (!options.flags.has('--preserve-data') && !options.flags.has('--purge-data')) {
      throw new VpsUsageError('vps uninstall requires --preserve-data or --purge-data')
    }
    remote.push(options.flags.has('--purge-data') ? '--purge-data' : '--preserve-data')
  }
  const result = await ssh(runner, sshOptions, remote, `remote vps ${action}`)
  return {
    ...parseRemoteJson(result, action),
    host: sshOptions.host,
    transport: {
      user: sshOptions.user,
      port: sshOptions.port,
      hostKeyPolicy: sshOptions.hostKeyPolicy,
      identity: sshOptions.identity === undefined ? 'ssh-agent-or-default' : 'explicit-file',
    },
  }
}

export async function runVpsCommand(
  action: string,
  args: string[],
  dependencies: VpsDependencies = {},
): Promise<Record<string, unknown>> {
  if (!Object.hasOwn(ACTION_OPTIONS, action)) throw new VpsUsageError(`unknown vps command: ${action}`)
  const typedAction = action as VpsAction
  const options = parseOptions(typedAction, args)
  const runner = dependencies.runner ?? defaultRunner
  const paths = { ...DEFAULT_PATHS, ...dependencies.paths }
  if (options.flags.has('--local')) {
    const sshOnlyOptions = [
      '--host', '--user', '--port', '--identity', '--known-hosts', '--host-key-policy',
    ]
    if (sshOnlyOptions.some((option) => options.values.has(option))) {
      throw new VpsUsageError('--local cannot be combined with SSH options')
    }
    if (typedAction === 'install' || typedAction === 'update') {
      return await localReleaseAction(typedAction, options, dependencies, runner, paths)
    }
    return await localSimpleAction(typedAction, options, dependencies, runner, paths)
  }
  const sshOptions = parseSsh(options)
  if (typedAction === 'install' || typedAction === 'update') {
    return await remoteArtifactAction(typedAction, options, dependencies, runner, sshOptions)
  }
  return await remoteSimpleAction(typedAction, options, runner, sshOptions)
}
